const POOL_A = "A";
const POOL_B = "B";
const POOL_C = "C";
const ALIAS_SEGMENTS_BY_POOL = {
  [POOL_A]: [4, 5, 4, 4],
  [POOL_B]: [4, 4, 5, 4],
  [POOL_C]: [4, 4, 4, 5],
};
const ALIAS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const POOL_A_ALIAS_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const POOL_B_ALIAS_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{4}$/;
const POOL_C_ALIAS_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{5}$/;
const ALIAS_PATTERN = POOL_A_ALIAS_PATTERN;
const REAL_CDKEY_INDEX_PREFIX = "REAL::";
const SYSTEM_REINDEX_DONE_KEY = "SYSTEM::REINDEX_DONE";
const REINDEX_DEFAULT_LIMIT = 20;
const REINDEX_MAX_LIMIT = 40;
const MAX_BATCH_COUNT = 100;
const MAX_PAIR_COUNT = 500;
const ACTIVATION_GATE_WAIT_MS = 10000;
const ACTIVATION_BUSY_MESSAGE = "\u5f53\u524d\u540c\u65f6\u5151\u6362\u4eba\u6570\u8fc7\u591a\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u4e00\u6b21";

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

function normalizePool(v) {
  const text = String(v || "").trim().toUpperCase();
  if (!text || text === POOL_A || text === "POOL_A" || text === "1") return POOL_A;
  if (text === POOL_B || text === "POOL_B" || text === "2") return POOL_B;
  if (text === POOL_C || text === "POOL_C" || text === "3") return POOL_C;
  throw new Error("pool is invalid.");
}

function aliasSegmentsForPool(poolRaw) {
  return ALIAS_SEGMENTS_BY_POOL[normalizePool(poolRaw)];
}

function detectAliasPool(aliasRaw) {
  const alias = normalizeAlias(aliasRaw);
  if (POOL_A_ALIAS_PATTERN.test(alias)) return POOL_A;
  if (POOL_B_ALIAS_PATTERN.test(alias)) return POOL_B;
  if (POOL_C_ALIAS_PATTERN.test(alias)) return POOL_C;
  return "";
}

function isValidAliasForPool(alias, pool) {
  return detectAliasPool(alias) === normalizePool(pool);
}

function mappedPool(mapped, alias) {
  if (mapped && mapped.pool) return normalizePool(mapped.pool);
  return detectAliasPool(alias) || POOL_A;
}

function realCdkeyIndexKey(realCdkey, poolRaw = POOL_A) {
  const normalized = normalizeRealCdkey(realCdkey);
  const pool = normalizePool(poolRaw);
  if (pool === POOL_B) return `${REAL_CDKEY_INDEX_PREFIX}${POOL_B}::${normalized}`;
  if (pool === POOL_C) return `${REAL_CDKEY_INDEX_PREFIX}${POOL_C}::${normalized}`;
  return `${REAL_CDKEY_INDEX_PREFIX}${normalized}`;
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

async function generateUniqueAlias(env, poolRaw = POOL_A) {
  const pool = normalizePool(poolRaw);
  const segments = aliasSegmentsForPool(pool);
  for (let i = 0; i < 3000; i += 1) {
    const alias = segments.map((n) => randomAliasSegment(n)).join("-");
    const exists = await env.ALIAS_MAP.get(alias);
    if (!exists) return alias;
  }
  throw new Error("Unable to generate unique alias CDKEY.");
}

function mappingMatchesPool(mapped, alias, poolRaw) {
  if (!mapped || typeof mapped !== "object") return false;
  try {
    return mappedPool(mapped, alias) === normalizePool(poolRaw);
  } catch {
    return false;
  }
}

async function storeAlias(env, realCdkey, poolRaw = POOL_A) {
  const pool = normalizePool(poolRaw);
  const normalizedCdkey = normalizeRealCdkey(realCdkey);
  const reverseKey = realCdkeyIndexKey(normalizedCdkey, pool);
  const indexedAlias = normalizeAlias(await env.ALIAS_MAP.get(reverseKey));
  if (indexedAlias && isValidAliasForPool(indexedAlias, pool)) {
    const mapped = await env.ALIAS_MAP.get(indexedAlias, { type: "json" });
    if (
      mapped &&
      normalizeRealCdkey(mapped.cdkey) === normalizedCdkey &&
      mappingMatchesPool(mapped, indexedAlias, pool)
    ) {
      return { alias: indexedAlias, created: false, pool };
    }
    await env.ALIAS_MAP.delete(reverseKey);
  }

  const alias = await generateUniqueAlias(env, pool);
  const realCdkeyTrimmed = String(realCdkey || "").trim();
  await env.ALIAS_MAP.put(
    alias,
    JSON.stringify({
      cdkey: realCdkeyTrimmed,
      cdkey_normalized: normalizedCdkey,
      pool,
      created_at: new Date().toISOString(),
    })
  );
  await env.ALIAS_MAP.put(reverseKey, alias);
  return { alias, created: true, pool };
}

async function reindexAliasMappings(env, cursorRaw, limitRaw) {
  const cursor = optionalString(cursorRaw);
  const limit = normalizeReindexLimit(limitRaw);
  const listed = await env.ALIAS_MAP.list(cursor ? { cursor, limit } : { limit });

  let processed = 0;
  let fixed = 0;
  for (const key of listed.keys || []) {
    const alias = String(key?.name || "");
    const pool = detectAliasPool(alias);
    if (!pool) continue;
    processed += 1;

    const mapped = await env.ALIAS_MAP.get(alias, { type: "json" });
    if (!mapped || typeof mapped !== "object" || !mapped.cdkey) continue;

    const normalizedCdkey = normalizeRealCdkey(mapped.cdkey);
    if (!normalizedCdkey) continue;

    const reverseKey = realCdkeyIndexKey(normalizedCdkey, pool);
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

async function lookupAliasMapping(env, aliasRaw) {
  const alias = normalizeAlias(aliasRaw);
  const pool = detectAliasPool(alias);
  if (!pool) {
    return { alias_cdkey: alias, cdkey: "", pool: "", created_at: "", found: false };
  }

  const mapped = await env.ALIAS_MAP.get(alias, { type: "json" });
  if (!mapped || !mapped.cdkey) {
    return { alias_cdkey: alias, cdkey: "", pool, created_at: "", found: false };
  }

  return {
    alias_cdkey: alias,
    cdkey: String(mapped.cdkey).trim(),
    pool: mappedPool(mapped, alias),
    created_at: mapped.created_at || "",
    found: true,
  };
}

function targetApiBase(env) {
  return String(env.TARGET_API_BASE || "https://gpt.86gamestore.com/api").replace(/\/+$/, "");
}

function fallbackTargetApiBase(env) {
  return String(env.FALLBACK_TARGET_API_BASE || "https://redeemgpt.com/api").replace(/\/+$/, "");
}

function poolBTargetApiBase(env) {
  return String(env.POOL_B_TARGET_API_BASE || "https://duolg.com/api").replace(/\/+$/, "");
}

function poolCTargetApiBase(env) {
  return String(env.POOL_C_TARGET_API_BASE || "https://ferri.chat/api").replace(/\/+$/, "");
}

function requiredTargetBase(base, name) {
  if (!base) throw new Error(`${name} is not configured.`);
  return base;
}

function targetApiBaseForPool(env, poolRaw) {
  const pool = normalizePool(poolRaw);
  if (pool === POOL_B) return requiredTargetBase(poolBTargetApiBase(env), "POOL_B_TARGET_API_BASE");
  if (pool === POOL_C) return requiredTargetBase(poolCTargetApiBase(env), "POOL_C_TARGET_API_BASE");
  return targetApiBase(env);
}

function shouldFallbackActivate(result) {
  if (!result || result.success === true) return false;
  const msg = String(result.msg || "");
  return ["无法提交", "暂时无法提交", "礼物不足", "库存不足"].some((keyword) =>
    msg.includes(keyword)
  );
}

function isDuolgCdkFormat(cdkey) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(cdkey || "").trim());
}

function normalizeDuolgResult(result) {
  if (!result || typeof result !== "object") return { success: false, msg: "duolg request failed", data: "" };
  if (result.success === true) return { success: true, msg: String(result.msg || "ok"), data: result.data || "" };
  const error = result.error && typeof result.error === "object" ? result.error : {};
  return {
    success: false,
    msg: String(result.msg || error.message || error.code || "duolg request failed"),
    data: error,
  };
}

function replaceOriginalCdkeyInResult(value, originalCdkey, aliasCdkey) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceOriginalCdkeyInResult(item, originalCdkey, aliasCdkey));
  }

  if (value && typeof value === "object") {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = replaceOriginalCdkeyInResult(entry, originalCdkey, aliasCdkey);
    }
    return output;
  }

  if (typeof value !== "string") return value;
  const original = String(originalCdkey || "").trim();
  const alias = String(aliasCdkey || "").trim();
  if (!original || !alias) return value;
  return value.replace(new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), alias);
}

function mapDuolgMessage(rawMessage, stage, success) {
  const raw = String(rawMessage || "").trim();
  const upper = raw.toUpperCase();

  if (success && stage === "/check") {
    if (!raw || raw === "ok") return "CDKEY状态正常";
    return raw;
  }

  if (!raw) return success ? "ok" : "兑换失败，请稍后重试";
  if (upper === "INVALID_CDK_FORMAT" || /Invalid CDK format/i.test(raw)) return "CDKEY格式错误，请检查后重新输入";
  if (raw === "session_info invalid." || /Invalid JSON format/i.test(raw)) return "session_info 不是有效的 JSON 格式";
  if (/Missing user\.id field/i.test(raw)) return "session_info 缺少 user.id";
  if (/Missing account\.id field/i.test(raw)) return "session_info 缺少 account.id";
  if (/Missing accessToken field/i.test(raw)) return "session_info 缺少 accessToken";
  if (upper === "CDK_NOT_FOUND" || /CDK not found/i.test(raw)) {
    return stage === "/check" ? "CDKEY不存在、已使用或当前不可兑换" : "CDKEY不存在或已失效";
  }
  if (/CDKEY unavailable/i.test(raw)) return "CDKEY不存在、已使用或当前不可兑换";
  return success ? raw : `兑换失败：${raw}`;
}

function presentPoolTargetResult(pool, stage, targetResult, aliasCdkey, originalCdkey) {
  if (normalizePool(pool) !== POOL_B || !targetResult || typeof targetResult !== "object") {
    return targetResult;
  }

  const sanitizedData = replaceOriginalCdkeyInResult(targetResult.data, originalCdkey, aliasCdkey);
  const output = {
    ...targetResult,
    msg: mapDuolgMessage(targetResult.msg, stage, targetResult.success === true),
    data: sanitizedData,
  };

  if (stage === "/check" && sanitizedData && typeof sanitizedData === "object") {
    output.data = {
      ...sanitizedData,
      cdkey: String(aliasCdkey || "").trim(),
    };
  }

  return output;
}

function duolgPlatformCredential(sessionInfo) {
  let parsed;
  try {
    parsed = JSON.parse(String(sessionInfo || ""));
  } catch {
    throw new Error("session_info invalid.");
  }
  return {
    platform: "chatgpt",
    data: {
      user: parsed.user,
      account: parsed.account,
      accessToken: parsed.accessToken,
    },
  };
}

async function callDuolgTarget(base, path, payload) {
  if (path === "/check") {
    if (!isDuolgCdkFormat(payload.cdkey)) return { success: false, msg: "INVALID_CDK_FORMAT", data: "" };
    const result = await callTarget(base, "/external/cdks/filter-unused", { cdks: [payload.cdkey] });
    const normalized = normalizeDuolgResult(result);
    if (!normalized.success) return normalized;
    const cdks = Array.isArray(result?.data?.cdks) ? result.data.cdks : [];
    const usable = cdks.includes(payload.cdkey);
    return { success: usable, msg: usable ? "ok" : "CDKEY unavailable", data: { cdkey: payload.cdkey, available: usable } };
  }

  if (path === "/activate") {
    let platformCredential;
    try {
      platformCredential = duolgPlatformCredential(payload.session_info);
    } catch (error) {
      return { success: false, msg: String(error?.message || "session_info invalid."), data: "" };
    }
    const verifyPayload = { cdk: payload.cdkey, platformCredential };
    const verifyResult = normalizeDuolgResult(await callTarget(base, "/external/redeem/verify", verifyPayload));
    if (!verifyResult.success) return verifyResult;

    const confirmPayload = { cdk: payload.cdkey, confirm: true, platformCredential };
    return normalizeDuolgResult(await callTarget(base, "/external/redeem/confirm", confirmPayload));
  }

  return callTarget(base, path, payload);
}

function normalizeFerriResult(result) {
  if (!result || typeof result !== "object") return { success: false, msg: "ferri request failed", data: "" };
  if (result.ok === true || result.success === true) return { success: true, msg: String(result.message || result.msg || "ok"), data: result };
  return { success: false, msg: String(result.error || result.message || result.msg || "ferri request failed"), data: result };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callFerriTarget(base, path, payload) {
  if (path === "/check") {
    const result = await callTarget(base, "/cards/verify", { code: String(payload.cdkey || "").trim().toUpperCase() });
    return normalizeFerriResult(result);
  }

  if (path === "/activate") {
    const startResult = await callTarget(base, "/workflow/start", {
      card_code: String(payload.cdkey || "").trim().toUpperCase(),
      token_snapshot: String(payload.session_info || "").trim(),
    });
    const normalizedStart = normalizeFerriResult(startResult);
    if (!normalizedStart.success) return normalizedStart;

    const jobId = String(startResult?.job?.id || "").trim();
    if (!jobId) return { success: false, msg: "ferri workflow job id missing", data: startResult };

    for (let i = 0; i < 12; i += 1) {
      await sleep(1500);
      const statusResult = await fetchTargetText(`${base}/workflow/status?id=${encodeURIComponent(jobId)}`);
      const job = statusResult?.job || {};
      if (job.status === "queued" || job.status === "running") continue;
      if (job.result) return normalizeFerriResult(job.result);
      return normalizeFerriResult(statusResult);
    }

    return { success: false, msg: "ferri workflow still running", data: { job_id: jobId } };
  }

  return callTarget(base, path, payload);
}

async function callPoolTarget(env, pool, path, payload) {
  const normalizedPool = normalizePool(pool);
  if (normalizedPool === POOL_B) {
    return callDuolgTarget(targetApiBaseForPool(env, POOL_B), path, payload);
  }
  if (normalizedPool === POOL_C) {
    return callFerriTarget(targetApiBaseForPool(env, POOL_C), path, payload);
  }
  return callTarget(targetApiBase(env), path, payload);
}

async function parseTargetText(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, msg: text, data: "" };
  }
}

async function fetchTargetText(url) {
  try {
    const resp = await fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
    return await parseTargetText(resp);
  } catch {
    return { success: false, msg: "target request failed", data: "" };
  }
}

async function callTarget(base, path, payload) {
  try {
    const resp = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await parseTargetText(resp);
  } catch {
    return { success: false, msg: "target request failed", data: "" };
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
    input,textarea,button,select{width:100%;box-sizing:border-box;border-radius:10px;padding:10px 12px}
    input,textarea,select{border:1px solid #3754a5;background:#0e1630;color:#fff}
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


    <label>CDKEY Pool</label>
    <select id="pool">
      <option value="A" selected>熊猫池 (4-5-4-4)</option>
      <option value="B">duolg池 (4-4-5-4)</option>
      <option value="C">ferri Pool (4-4-4-5)</option>
    </select>
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
    <p>低写入模式：批量生成不会自动修复历史索引；历史老CDKEY如需补索引，请手动点击“修复历史索引”。</p>

    <label>查询：二次CDKEY -> 原CDKEY</label>
    <div class="row">
      <input id="lookupAlias" type="text" placeholder="Alias CDKEY, Pool A / B / C"/>
      <button id="lookup">查询对应原CDKEY</button>
    </div>
    <label>批量反查询：二次CDKEY -> 原CDKEY（每行一个）</label>
    <textarea id="lookupAliasList" placeholder="每行一个二次CDKEY"></textarea>
    <div class="row">
      <button id="lookupBatch">批量查询对应原CDKEY</button>
      <button id="copyLookupBatch" class="secondary">复制批量反查结果</button>
    </div>
    <div class="row" style="margin-top:10px">
      <button id="copyLookupOriginals" class="secondary">仅复制原CDKEY列表</button>
      <button id="noopLookup" class="secondary" disabled>仅复制查询成功项</button>
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
    let lastLookupBatchText='';
    let lastLookupOriginalList=[];
    const res=document.getElementById('res');

    function show(t){res.textContent=t;}
    function getPool(){return document.getElementById('pool').value || 'A';}

    async function request(path, payload){
      const p=document.getElementById('pwd').value.trim();
      if(!p){show('请输入管理密码'); return null;}
      const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Password':p},body:JSON.stringify(payload)});
      const j=await r.json();
      if(!r.ok||j.success!==true){show(j.msg||'操作失败'); return null;}
      return j;
    }

    async function doCreate(batchMode){
      const c=document.getElementById('cdkey').value.trim();
      const countRaw=document.getElementById('count').value.trim();
      const count=Math.max(1,Math.min(100,Number.parseInt(countRaw||'1',10)||1));
      if(!c){show('请输入单个原始CDKEY');return;}

      show(batchMode?'批量生成中...':'生成中...');
      const path=batchMode?'/v1/admin/alias/create-batch':'/v1/admin/alias/create';
      const payload=batchMode?{cdkey:c,count,pool:getPool()}:{cdkey:c,pool:getPool()};
      const j=await request(path,payload);
      if(!j) return;

      if(batchMode){
        lastAliasList=(j.data&&j.data.alias_cdkeys)||[];
        lastAlias=lastAliasList[0]||'';
        lastPairList=[];
        const created=(j.data&&j.data.created)===true;
        const requested=(j.data&&j.data.requested_count)||count;
        show('Done\\nPool: '+(j.data.pool||getPool())+'\\nOriginal CDKEY: '+c+'\\nAlias CDKEY: '+lastAlias+'\\nStatus: '+(created?'Created':'Exists')+'\\nRequested count: '+requested+' (one-to-one mode keeps one alias)');
        return;
      }

      lastAlias=j.data.alias_cdkey||'';
      lastAliasList=lastAlias?[lastAlias]:[];
      lastPairList=[];
      show('Done\\nPool: '+(j.data.pool||getPool())+'\\nOriginal CDKEY: '+c+'\\nAlias CDKEY: '+lastAlias+'\\nStatus: '+((j.data&&j.data.created)===true?'Created':'Exists'));
    }

    async function doPairBatch(){
      const lines=String(document.getElementById('cdkeyList').value||'')
        .split(/\\r?\\n/)
        .map(v=>v.trim())
        .filter(Boolean);
      if(!lines.length){show('请先输入原始CDKEY列表');return;}

      show('一对一批量生成中...');
      const j=await request('/v1/admin/alias/create-from-list',{cdkeys:lines,pool:getPool()});
      if(!j) return;

      lastPairList=(j.data&&j.data.pairs)||[];
      lastAliasList=lastPairList.map(v=>v.alias_cdkey);
      lastAlias=lastAliasList[0]||'';

      const rows=lastPairList.map(v=>v.cdkey+' => '+v.alias_cdkey+' ['+(v.created?'Created':'Exists')+'] ['+(v.pool||getPool())+']');
      show('Pair batch done\\nPool: '+((j.data&&j.data.pool)||getPool())+'\\nCount: '+lastPairList.length+'\\n\\n'+rows.join('\\n'));
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
      lastLookupBatchText='';
      lastLookupOriginalList=[];
      show('Lookup ok\\nPool: '+(item.pool||'')+'\\nAlias CDKEY: '+(item.alias_cdkey||'')+'\\nOriginal CDKEY: '+(item.cdkey||''));
    }

    async function doLookupBatch(){
      const aliases=String(document.getElementById('lookupAliasList').value||'')
        .split(/\\r?\\n/)
        .map(v=>v.trim())
        .filter(Boolean);
      if(!aliases.length){show('请先输入二次CDKEY列表');return;}
      show('批量查询中...');
      const j=await request('/v1/admin/alias/lookup-from-list',{alias_cdkeys:aliases});
      if(!j) return;
      const items=(j.data&&j.data.items)||[];
      const rows=items.map(item=>{
        const alias=item.alias_cdkey||'';
        const original=item.cdkey||'';
        const pool=item.pool?' ['+item.pool+']':'';
        return alias+' => '+original+pool+' ['+(item.found?'Found':'NotFound')+']';
      });
      lastLookupBatchText=rows.join('\\n');
      lastLookupOriginalList=items.filter(item=>item.found&&item.cdkey).map(item=>item.cdkey);
      show('Lookup batch done\\nCount: '+(j.data&&j.data.count||items.length)+'\\nFound: '+(j.data&&j.data.found_count||0)+'\\nMissing: '+(j.data&&j.data.missing_count||0)+'\\n\\n'+lastLookupBatchText);
    }

    document.getElementById('create').onclick=()=>doCreate(false);
    document.getElementById('batch').onclick=()=>doCreate(true);
    document.getElementById('pairBatch').onclick=doPairBatch;
    document.getElementById('reindexAll').onclick=async()=>{
      await runReindexFlow(true);
    };
    document.getElementById('lookup').onclick=doLookup;
    document.getElementById('lookupBatch').onclick=doLookupBatch;

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

    document.getElementById('copyLookupBatch').onclick=async()=>{
      if(!lastLookupBatchText){show('暂无可复制批量反查结果');return;}
      try{await navigator.clipboard.writeText(lastLookupBatchText);show('已复制批量反查结果');}catch{show('复制失败，请手动复制\\n'+lastLookupBatchText);}
    };

    document.getElementById('copyLookupOriginals').onclick=async()=>{
      if(!lastLookupOriginalList.length){show('暂无可复制原CDKEY列表');return;}
      const out=lastLookupOriginalList.join('\\n');
      try{await navigator.clipboard.writeText(out);show('已复制原CDKEY列表，共 '+lastLookupOriginalList.length+' 个');}catch{show('复制失败，请手动复制\\n'+out);}
    };
  </script>
</body>
</html>`;
}


async function runActivateFromBody(body, env) {
  const alias = normalizeAlias(requiredString(body.alias_cdkey, "alias_cdkey"));
  const sessionInfo = requiredString(body.session_info, "session_info");
  const force = normalizeForceValue(body.force);
  const pool = detectAliasPool(alias);
  if (!pool) return json({ success: false, msg: "CDKEY not found", data: "" });

  const mapped = await env.ALIAS_MAP.get(alias, { type: "json" });
  if (!mapped || !mapped.cdkey) return json({ success: false, msg: "CDKEY not found", data: "" });

  const targetPayload = {
    cdkey: String(mapped.cdkey).trim(),
    session_info: sessionInfo,
    force,
  };
  const primaryResult = await callPoolTarget(env, pool, "/activate", targetPayload);
  const fallbackUsed = pool === POOL_A && shouldFallbackActivate(primaryResult);
  const rawTargetResult = fallbackUsed
    ? await callTarget(fallbackTargetApiBase(env), "/activate", targetPayload)
    : primaryResult;
  const targetResult = presentPoolTargetResult(pool, "/activate", rawTargetResult, alias, mapped.cdkey);
  return json({
    success: Boolean(targetResult && targetResult.success),
    msg: String(targetResult?.msg || "ok"),
    data: {
      alias_cdkey: alias,
      target_result: targetResult,
      fallback_used: fallbackUsed,
      attempt_count: fallbackUsed ? 2 : 1,
    },
  });
}

async function runActivateThroughGate(request, env) {
  if (!env.ACTIVATION_GATE) {
    const body = await parseBody(request);
    return runActivateFromBody(body, env);
  }

  const bodyText = await request.text();
  const id = env.ACTIVATION_GATE.idFromName("global");
  const stub = env.ACTIVATION_GATE.get(id);
  return stub.fetch("https://activation-gate/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyText,
  });
}

export class ActivationGate {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.active = false;
    this.queue = [];
  }

  async fetch(request) {
    let acquired = false;
    try {
      acquired = await this.acquire();
      const body = await parseBody(request);
      return await runActivateFromBody(body, this.env);
    } catch (error) {
      if (error && error.busy === true) {
        return json({ success: false, msg: ACTIVATION_BUSY_MESSAGE, data: "" });
      }
      return json({ success: false, msg: error.message || "bad request", data: "" }, error.status || 400);
    } finally {
      if (acquired) this.release();
    }
  }

  acquire() {
    if (!this.active) {
      this.active = true;
      return Promise.resolve(true);
    }

    return new Promise((resolve, reject) => {
      const ticket = { resolve, reject, done: false, timer: null };
      ticket.timer = setTimeout(() => {
        if (ticket.done) return;
        ticket.done = true;
        this.queue = this.queue.filter((item) => item !== ticket);
        const error = new Error(ACTIVATION_BUSY_MESSAGE);
        error.busy = true;
        reject(error);
      }, ACTIVATION_GATE_WAIT_MS);
      this.queue.push(ticket);
    });
  }

  release() {
    while (this.queue.length) {
      const next = this.queue.shift();
      if (!next || next.done) continue;
      next.done = true;
      clearTimeout(next.timer);
      this.active = true;
      next.resolve(true);
      return;
    }
    this.active = false;
  }
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
          data: { target_api_base: targetApiBase(env), pool_b_configured: Boolean(poolBTargetApiBase(env)) },
        });
      }

      if (
        request.method === "POST" &&
        (url.pathname === "/v1/admin/alias/create" || url.pathname === "/v1/alias/create")
      ) {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);
        const realCdkey = requiredString(body.cdkey, "cdkey");
        const result = await storeAlias(env, realCdkey, body.pool);
        return json({
          success: true,
          msg: result.created ? "alias created" : "alias exists",
          data: { alias_cdkey: result.alias, created: result.created, pool: result.pool },
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/admin/alias/create-batch") {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);
        const realCdkey = requiredString(body.cdkey, "cdkey");
        const pool = normalizePool(body.pool);
        const countRaw = Number.parseInt(String(body.count || "1"), 10);
        const count = Math.max(1, Math.min(MAX_BATCH_COUNT, Number.isNaN(countRaw) ? 1 : countRaw));

        const result = await storeAlias(env, realCdkey, pool);
        const aliases = [result.alias];

        return json({
          success: true,
          msg: result.created ? "alias created" : "alias exists",
          data: {
            count: aliases.length,
            requested_count: count,
            alias_cdkeys: aliases,
            created: result.created,
            pool: result.pool,
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
          throw new Error(`Maximum ${MAX_PAIR_COUNT} original CDKEYs per request.`);
        }

        const pool = normalizePool(body.pool);
        const pairs = [];
        for (const cdkey of cdkeys) {
          const result = await storeAlias(env, cdkey, pool);
          pairs.push({ cdkey, alias_cdkey: result.alias, created: result.created, pool: result.pool });
        }
        const createdCount = pairs.filter((v) => v.created).length;

        return json({
          success: true,
          msg: "pair batch processed",
          data: { count: pairs.length, created_count: createdCount, existing_count: pairs.length - createdCount, pool, pairs },
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/admin/alias/lookup") {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);
        const item = await lookupAliasMapping(env, requiredString(body.alias_cdkey, "alias_cdkey"));
        if (!item.found) {
          return json({ success: false, msg: "CDKEY not found", data: "" });
        }

        return json({
          success: true,
          msg: "ok",
          data: item,
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/admin/alias/lookup-from-list") {
        const body = await parseBody(request);
        assertAdminPassword(request, body, env);

        let aliases = [];
        if (Array.isArray(body.alias_cdkeys)) {
          aliases = body.alias_cdkeys.map((v) => String(v || "").trim()).filter(Boolean);
        } else if (typeof body.alias_cdkeys_text === "string") {
          aliases = parseCdkeyLines(body.alias_cdkeys_text);
        }

        if (!aliases.length) {
          throw new Error("alias_cdkeys is required.");
        }

        if (aliases.length > MAX_PAIR_COUNT) {
          throw new Error(`Maximum ${MAX_PAIR_COUNT} alias CDKEYs per request.`);
        }

        const items = [];
        for (const alias of aliases) {
          items.push(await lookupAliasMapping(env, alias));
        }
        const foundCount = items.filter((item) => item.found).length;

        return json({
          success: true,
          msg: "lookup batch processed",
          data: {
            count: items.length,
            found_count: foundCount,
            missing_count: items.length - foundCount,
            items,
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
        const pool = detectAliasPool(alias);
        if (!pool) return json({ success: false, msg: "CDKEY not found", data: "" });

        const mapped = await env.ALIAS_MAP.get(alias, { type: "json" });
        if (!mapped || !mapped.cdkey) return json({ success: false, msg: "CDKEY not found", data: "" });

        const rawTargetResult = await callPoolTarget(env, pool, "/check", { cdkey: String(mapped.cdkey).trim() });
        const targetResult = presentPoolTargetResult(pool, "/check", rawTargetResult, alias, mapped.cdkey);
        return json({
          success: Boolean(targetResult && targetResult.success),
          msg: String(targetResult?.msg || "ok"),
          data: { alias_cdkey: alias, target_result: targetResult },
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/alias/activate") {
        return runActivateThroughGate(request, env);
      }

      return json({ success: false, msg: "not found", data: "" }, 404);
    } catch (error) {
      return json({ success: false, msg: error.message || "bad request", data: "" }, error.status || 400);
    }
  },
};
