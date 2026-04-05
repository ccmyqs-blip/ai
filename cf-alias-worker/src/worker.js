const ALIAS_SEGMENTS = [4, 5, 4, 4];
const ALIAS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALIAS_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const REAL_CDKEY_INDEX_PREFIX = "REAL::";
const SYSTEM_REINDEX_DONE_KEY = "SYSTEM::REINDEX_DONE";
const REINDEX_DEFAULT_LIMIT = 20;
const REINDEX_MAX_LIMIT = 40;
const MAX_BATCH_COUNT = 100;
const MAX_PAIR_COUNT = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Admin-Password",
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function normalizeAlias(v) {
  return String(v || "").trim().toUpperCase();
}

function normalizeRealCdkey(v) {
  return String(v || "").trim().toUpperCase();
}

function realCdkeyIndexKey(realCdkey) {
  return `${REAL_CDKEY_INDEX_PREFIX}${normalizeRealCdkey(realCdkey)}`;
}

function requiredString(v, name) {
  const out = String(v || "").trim();
  if (!out) throw new Error(`${name} is required.`);
  return out;
}

function optionalString(v) {
  const out = String(v || "").trim();
  return out || "";
}

function normalizeReindexLimit(v) {
  const parsed = Number.parseInt(String(v || ""), 10);
  if (Number.isNaN(parsed)) return REINDEX_DEFAULT_LIMIT;
  return Math.max(1, Math.min(REINDEX_MAX_LIMIT, parsed));
}

function normalizeForceValue(v) {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v > 0 ? 1 : 0;
  const text = String(v || "").trim().toLowerCase();
  if (!text) return 0;
  if (text === "1" || text === "true" || text === "yes" || text === "on") return 1;
  return 0;
}

function getAdminPassword(request, body) {
  const fromHeader = (request.headers.get("X-Admin-Password") || "").trim();
  if (fromHeader) return fromHeader;
  return String(body?.admin_password || "").trim();
}

function assertAdminPassword(request, body, env) {
  const pass = getAdminPassword(request, body);
  const expected = String(env.ADMIN_PASSWORD || "").trim();
  if (!expected || pass !== expected) {
    const err = new Error("管理密码错误");
    err.status = 401;
    throw err;
  }
}

function randomAliasSegment(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALIAS_CHARS[bytes[i] % ALIAS_CHARS.length];
  return out;
}

async function generateUniqueAlias(env) {
  for (let i = 0; i < 3000; i += 1) {
    const alias = ALIAS_SEGMENTS.map((n) => randomAliasSegment(n)).join("-");
    const exists = await env.ALIAS_MAP.get(alias);
    if (!exists) return alias;
  }
  throw new Error("无法生成不重复二次CDKEY");
}

async function storeAlias(env, realCdkey) {
  const normalizedCdkey = normalizeRealCdkey(realCdkey);
  const reverseKey = realCdkeyIndexKey(normalizedCdkey);
  const indexedAlias = normalizeAlias(await env.ALIAS_MAP.get(reverseKey));
  if (indexedAlias && ALIAS_PATTERN.test(indexedAlias)) {
    const mapped = await env.ALIAS_MAP.get(indexedAlias, { type: "json" });
    if (mapped && normalizeRealCdkey(mapped.cdkey) === normalizedCdkey) {
      return { alias: indexedAlias, created: false };
    }
    await env.ALIAS_MAP.delete(reverseKey);
  }

  const alias = await generateUniqueAlias(env);
  const realCdkeyTrimmed = String(realCdkey || "").trim();
  await env.ALIAS_MAP.put(
    alias,
    JSON.stringify({
      cdkey: realCdkeyTrimmed,
      cdkey_normalized: normalizedCdkey,
      created_at: new Date().toISOString(),
    })
  );
  await env.ALIAS_MAP.put(reverseKey, alias);
  return { alias, created: true };
}

async function reindexAliasMappings(env, cursorRaw, limitRaw) {
  const cursor = optionalString(cursorRaw);
  const limit = normalizeReindexLimit(limitRaw);
  const listed = await env.ALIAS_MAP.list(cursor ? { cursor, limit } : { limit });

  let processed = 0;
  let fixed = 0;
  for (const key of listed.keys || []) {
    const alias = String(key?.name || "");
    if (!ALIAS_PATTERN.test(alias)) continue;
    processed += 1;

    const mapped = await env.ALIAS_MAP.get(alias, { type: "json" });
    if (!mapped || typeof mapped !== "object" || !mapped.cdkey) continue;

    const normalizedCdkey = normalizeRealCdkey(mapped.cdkey);
    if (!normalizedCdkey) continue;

    const reverseKey = realCdkeyIndexKey(normalizedCdkey);
    await env.ALIAS_MAP.put(reverseKey, alias);
    fixed += 1;
  }

  const done = Boolean(listed.list_complete);
  const nextCursor = done ? "" : String(listed.cursor || "");
  return { processed, fixed, next_cursor: nextCursor, done };
}

async function getReindexDoneStatus(env) {
  const raw = await env.ALIAS_MAP.get(SYSTEM_REINDEX_DONE_KEY, { type: "json" });
  if (!raw || typeof raw !== "object") return { done: false, updated_at: "" };
  return {
    done: raw.done === true,
    updated_at: String(raw.updated_at || "").trim(),
  };
}

async function markReindexDone(env) {
  await env.ALIAS_MAP.put(
    SYSTEM_REINDEX_DONE_KEY,
    JSON.stringify({ done: true, updated_at: new Date().toISOString() })
  );
}

function parseCdkeyLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function callTarget(env, path, payload) {
  const base = String(env.TARGET_API_BASE || "https://gpt.86gamestore.com/api").replace(/\/+$/, "");
  try {
    const resp = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { success: false, msg: text, data: "" };
    }
    return parsed;
  } catch {
    return { success: false, msg: "套壳网站接口请求失败", data: "" };
  }
}

async function parseBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function adminHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Alias CDKEY Admin</title>
  <style>
    body{font-family:Segoe UI,Microsoft YaHei,sans-serif;background:#0b1020;color:#e6edff;margin:0;padding:20px}
    .panel{max-width:860px;margin:0 auto;background:#111a33;border:1px solid #253463;border-radius:14px;padding:20px}
    h1{margin:0 0 10px}
    p{margin:0 0 14px;color:#a9b9ef}
    label{display:block;margin:10px 0 6px;font-weight:700}
    input,textarea,button{width:100%;box-sizing:border-box;border-radius:10px;padding:10px 12px}
    input,textarea{border:1px solid #3754a5;background:#0e1630;color:#fff}
    textarea{min-height:120px;resize:vertical}
    button{border:none;background:linear-gradient(135deg,#21d4fd,#2962ff);color:#fff;font-weight:700;cursor:pointer}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .row3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}
    .secondary{background:#1f2f5f}
    pre{white-space:pre-wrap;background:#0b142b;border:1px solid #30467f;border-radius:10px;padding:12px}
  </style>
</head>
<body>
  <main class="panel">
    <h1>二次CDKEY隐藏管理页</h1>
    <p>入口：/_hidden/alias-admin</p>
    <p>规则：同一个原始CDKEY只会对应一个二次CDKEY（自动查重）</p>

    <label>管理密码</label>
    <input id="pwd" type="password" placeholder="请输入管理密码" autocomplete="new-password"/>

    <label>单个原始CDKEY</label>
    <input id="cdkey" type="text" placeholder="输入一个原始CDKEY"/>
    <div class="row3">
      <input id="count" type="number" min="1" max="100" value="10" placeholder="批量数量"/>
      <button id="create">单个生成</button>
      <button id="batch">同原CDKEY查重生成(一对一)</button>
    </div>

    <label>一对一批量原始CDKEY（每行一个）</label>
    <textarea id="cdkeyList" placeholder="每行一个原始CDKEY"></textarea>
    <div class="row">
      <button id="pairBatch">一对一批量生成</button>
      <button id="copyPair" class="secondary">复制映射列表</button>
    </div>
    <div class="row" style="margin-top:10px">
      <button id="reindexAll">修复历史索引</button>
      <button id="noop" class="secondary" disabled>索引分页默认 20</button>
    </div>

    <label>查询：二次CDKEY -> 原CDKEY</label>
    <div class="row">
      <input id="lookupAlias" type="text" placeholder="输入二次CDKEY，例如 5S8F-S888G-5G5G-55HH"/>
      <button id="lookup">查询对应原CDKEY</button>
    </div>

    <div class="row" style="margin-top:10px">
      <button id="copy" class="secondary">复制单个结果</button>
      <button id="copyList" class="secondary">仅复制二次CDKEY列表</button>
    </div>

    <pre id="res">等待操作...</pre>
  </main>

  <script>
    let lastAlias='';
    let lastAliasList=[];
    let lastPairList=[];
    const res=document.getElementById('res');

    function show(t){res.textContent=t;}

    async function request(path, payload){
      const p=document.getElementById('pwd').value.trim();
      if(!p){show('请输入管理密码'); return null;}
      const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Password':p},body:JSON.stringify(payload)});
      const j=await r.json();
      if(!r.ok||j.success!==true){show(j.msg||'操作失败'); return null;}
      return j;
    }

    async function getGlobalReindexDoneStatus(){
      const j=await request('/v1/admin/alias/reindex-status',{});
      if(!j) return null;
      return (j.data&&j.data.done)===true;
    }

    async function doCreate(batchMode){
      const c=document.getElementById('cdkey').value.trim();
      const countRaw=document.getElementById('count').value.trim();
      const count=Math.max(1,Math.min(100,Number.parseInt(countRaw||'1',10)||1));
      if(!c){show('请输入单个原始CDKEY');return;}

      show(batchMode?'批量生成中...':'生成中...');
      const path=batchMode?'/v1/admin/alias/create-batch':'/v1/admin/alias/create';
      const payload=batchMode?{cdkey:c,count}:{cdkey:c};
      const j=await request(path,payload);
      if(!j) return;

      if(batchMode){
        lastAliasList=(j.data&&j.data.alias_cdkeys)||[];
        lastAlias=lastAliasList[0]||'';
        lastPairList=[];
        const created=(j.data&&j.data.created)===true;
        const requested=(j.data&&j.data.requested_count)||count;
        show('一对一模式处理完成\\n原CDKEY: '+c+'\\n二次CDKEY: '+lastAlias+'\\n状态: '+(created?'新建':'已存在')+'\\n请求数量: '+requested+'（一对一模式下仅保留1个）');
        return;
      }

      lastAlias=j.data.alias_cdkey||'';
      lastAliasList=lastAlias?[lastAlias]:[];
      lastPairList=[];
      show('处理完成\\n原CDKEY: '+c+'\\n二次CDKEY: '+lastAlias+'\\n状态: '+((j.data&&j.data.created)===true?'新建':'已存在'));
    }

    async function doPairBatch(){
      const lines=String(document.getElementById('cdkeyList').value||'')
        .split(/\\r?\\n/)
        .map(v=>v.trim())
        .filter(Boolean);
      if(!lines.length){show('请先输入原始CDKEY列表');return;}

      const reindexDone=await getGlobalReindexDoneStatus();
      if(reindexDone===null) return;
      if(!reindexDone){
        show('批量前修复历史索引中...');
        const ready=await runReindexFlow(false);
        if(!ready) return;
      }

      show('一对一批量生成中...');
      const j=await request('/v1/admin/alias/create-from-list',{cdkeys:lines});
      if(!j) return;

      lastPairList=(j.data&&j.data.pairs)||[];
      lastAliasList=lastPairList.map(v=>v.alias_cdkey);
      lastAlias=lastAliasList[0]||'';

      const rows=lastPairList.map(v=>v.cdkey+' => '+v.alias_cdkey+' ['+(v.created?'新建':'已存在')+']');
      show('一对一批量处理完成\\n数量: '+lastPairList.length+'\\n\\n'+rows.join('\\n'));
    }

    async function runReindexFlow(manual){
      let cursor='';
      let rounds=0;
      let processedTotal=0;
      let fixedTotal=0;
      while(true){
        rounds+=1;
        const payload={limit:20};
        if(cursor) payload.cursor=cursor;

        const j=await request('/v1/admin/alias/reindex',payload);
        if(!j) return false;

        const data=j.data||{};
        processedTotal+=Number(data.processed||0);
        fixedTotal+=Number(data.fixed||0);
        cursor=String(data.next_cursor||'').trim();
        const done=data.done===true;

        if(done){
          const title=manual?'历史索引修复完成':'批量前索引预处理完成';
          show(title+'\\n轮次: '+rounds+'\\n扫描: '+processedTotal+'\\n修复: '+fixedTotal);
          return true;
        }

        show((manual?'历史索引修复中...':'批量前索引预处理中...')+'\\n轮次: '+rounds+'\\n扫描: '+processedTotal+'\\n修复: '+fixedTotal);

        if(rounds>=5000){
          show('索引修复中止：轮次过多，请稍后重试');
          return false;
        }
      }
    }

    async function doLookup(){
      const alias=String(document.getElementById('lookupAlias').value||'').trim();
      if(!alias){show('请先输入二次CDKEY');return;}
      show('查询中...');
      const j=await request('/v1/admin/alias/lookup',{alias_cdkey:alias});
      if(!j) return;
      const item=j.data||{};
      show('查询成功\\n二次CDKEY: '+(item.alias_cdkey||'')+'\\n原CDKEY: '+(item.cdkey||''));
    }

    document.getElementById('create').onclick=()=>doCreate(false);
    document.getElementById('batch').onclick=()=>doCreate(true);
    document.getElementById('pairBatch').onclick=doPairBatch;
    document.getElementById('reindexAll').onclick=async()=>{
      await runReindexFlow(true);
    };
    document.getElementById('lookup').onclick=doLookup;

    document.getElementById('copy').onclick=async()=>{
      if(!lastAlias){show('暂无可复制结果');return;}
      try{await navigator.clipboard.writeText(lastAlias);show('已复制: '+lastAlias);}catch{show('复制失败，请手动复制: '+lastAlias);}
    };

    document.getElementById('copyList').onclick=async()=>{
      if(!lastAliasList.length){show('暂无可复制列表');return;}
      const out=lastAliasList.join('\\n');
      try{await navigator.clipboard.writeText(out);show('已复制二次CDKEY列表，共 '+lastAliasList.length+' 个');}catch{show('复制失败，请手动复制\\n'+out);}
    };

    document.getElementById('copyPair').onclick=async()=>{
      if(!lastPairList.length){show('暂无可复制映射');return;}
      const out=lastPairList.map(v=>v.cdkey+' => '+v.alias_cdkey).join('\\n');
      try{await navigator.clipboard.writeText(out);show('已复制一对一映射，共 '+lastPairList.length+' 条');}catch{show('复制失败，请手动复制\\n'+out);}
    };
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if (request.method === "GET" && url.pathname === "/_hidden/alias-admin") {
        return html(adminHtml());
      }

      if (request.method === "GET" && url.pathname === "/v1/health") {
        return json({
          success: true,
          msg: "ok",
          data: { target_api_base: String(env.TARGET_API_BASE || "https://gpt.86gamestore.com/api") },
        });
      }

      if (
        request.method === "POST" &&
        (url.pathname === "/v1/admin/alias/create" || url.pathname === "/v1/alias/create")
      ) {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);
        const realCdkey = requiredString(body.cdkey, "cdkey");
        const result = await storeAlias(env, realCdkey);
        return json({
          success: true,
          msg: result.created ? "alias created" : "alias exists",
          data: { alias_cdkey: result.alias, created: result.created },
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/admin/alias/create-batch") {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);
        const realCdkey = requiredString(body.cdkey, "cdkey");
        const countRaw = Number.parseInt(String(body.count || "1"), 10);
        const count = Math.max(1, Math.min(MAX_BATCH_COUNT, Number.isNaN(countRaw) ? 1 : countRaw));

        const result = await storeAlias(env, realCdkey);
        const aliases = [result.alias];

        return json({
          success: true,
          msg: result.created ? "alias created" : "alias exists",
          data: {
            count: aliases.length,
            requested_count: count,
            alias_cdkeys: aliases,
            created: result.created,
          },
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/admin/alias/create-from-list") {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);

        let cdkeys = [];
        if (Array.isArray(body.cdkeys)) {
          cdkeys = body.cdkeys.map((v) => String(v || "").trim()).filter(Boolean);
        } else if (typeof body.cdkeys_text === "string") {
          cdkeys = parseCdkeyLines(body.cdkeys_text);
        }

        if (!cdkeys.length) {
          throw new Error("cdkeys is required.");
        }

        if (cdkeys.length > MAX_PAIR_COUNT) {
          throw new Error(`单次最多处理 ${MAX_PAIR_COUNT} 个原始CDKEY`);
        }

        const pairs = [];
        for (const cdkey of cdkeys) {
          const result = await storeAlias(env, cdkey);
          pairs.push({ cdkey, alias_cdkey: result.alias, created: result.created });
        }
        const createdCount = pairs.filter((v) => v.created).length;

        return json({
          success: true,
          msg: "pair batch processed",
          data: { count: pairs.length, created_count: createdCount, existing_count: pairs.length - createdCount, pairs },
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/admin/alias/lookup") {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);
        const alias = normalizeAlias(requiredString(body.alias_cdkey, "alias_cdkey"));
        if (!ALIAS_PATTERN.test(alias)) {
          return json({ success: false, msg: "未检测到CDKEY", data: "" });
        }

        const mapped = await env.ALIAS_MAP.get(alias, { type: "json" });
        if (!mapped || !mapped.cdkey) {
          return json({ success: false, msg: "未检测到CDKEY", data: "" });
        }

        return json({
          success: true,
          msg: "ok",
          data: {
            alias_cdkey: alias,
            cdkey: String(mapped.cdkey).trim(),
            created_at: mapped.created_at || "",
          },
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/admin/alias/reindex") {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);
        const data = await reindexAliasMappings(env, body.cursor, body.limit);
        if (data.done) {
          await markReindexDone(env);
        }
        return json({ success: true, msg: "reindex ok", data });
      }

      if (request.method === "POST" && url.pathname === "/v1/admin/alias/reindex-status") {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);
        const data = await getReindexDoneStatus(env);
        return json({ success: true, msg: "ok", data });
      }

      if (request.method === "POST" && url.pathname === "/v1/alias/check") {
        const body = await parseBody(request);
        const alias = normalizeAlias(requiredString(body.alias_cdkey, "alias_cdkey"));
        if (!ALIAS_PATTERN.test(alias)) return json({ success: false, msg: "未检测到CDKEY", data: "" });

        const mapped = await env.ALIAS_MAP.get(alias, { type: "json" });
        if (!mapped || !mapped.cdkey) return json({ success: false, msg: "未检测到CDKEY", data: "" });

        const targetResult = await callTarget(env, "/check", { cdkey: String(mapped.cdkey).trim() });
        return json({
          success: Boolean(targetResult && targetResult.success),
          msg: String(targetResult?.msg || "ok"),
          data: { alias_cdkey: alias, target_result: targetResult },
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/alias/activate") {
        const body = await parseBody(request);
        const alias = normalizeAlias(requiredString(body.alias_cdkey, "alias_cdkey"));
        const sessionInfo = requiredString(body.session_info, "session_info");
        const force = normalizeForceValue(body.force);
        if (!ALIAS_PATTERN.test(alias)) return json({ success: false, msg: "未检测到CDKEY", data: "" });

        const mapped = await env.ALIAS_MAP.get(alias, { type: "json" });
        if (!mapped || !mapped.cdkey) return json({ success: false, msg: "未检测到CDKEY", data: "" });

        const targetResult = await callTarget(env, "/activate", {
          cdkey: String(mapped.cdkey).trim(),
          session_info: sessionInfo,
          force,
        });
        return json({
          success: Boolean(targetResult && targetResult.success),
          msg: String(targetResult?.msg || "ok"),
          data: { alias_cdkey: alias, target_result: targetResult },
        });
      }

      return json({ success: false, msg: "not found", data: "" }, 404);
    } catch (error) {
      return json({ success: false, msg: error.message || "bad request", data: "" }, error.status || 400);
    }
  },
};
