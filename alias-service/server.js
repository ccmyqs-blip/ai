"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number.parseInt(process.env.PORT || "4190", 10);
const TARGET_API_BASE = (process.env.TARGET_API_BASE || "https://gpt.86gamestore.com/api").replace(/\/+$/, "");
const FALLBACK_TARGET_API_BASE = (process.env.FALLBACK_TARGET_API_BASE || "https://redeemgpt.com/api").replace(/\/+$/, "");
const POOL_B_TARGET_API_BASE = (process.env.POOL_B_TARGET_API_BASE || "https://duolg.com/api").replace(/\/+$/, "");
const POOL_C_TARGET_API_BASE = (process.env.POOL_C_TARGET_API_BASE || "https://ferri.chat/api").replace(/\/+$/, "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Cc123123.";
const STORE_FILE = path.join(__dirname, "alias-map.json");
const ADMIN_PAGE_FILE = path.join(__dirname, "admin.html");
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
const MAX_PAIR_COUNT = 500;
const ACTIVATION_GATE_WAIT_MS = 10000;
const ACTIVATION_BUSY_MESSAGE = "\u5f53\u524d\u540c\u65f6\u5151\u6362\u4eba\u6570\u8fc7\u591a\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u4e00\u6b21";
const SUBSCRIPTION_GATEWAY_BASE = "https://gpt.serve.freespaces.app";
const SUBSCRIPTION_INFO_PATH = "/api/subscription/info";
const SUBSCRIPTION_CANCEL_PATH = "/api/subscription/cancel";
const activationGate = {
  active: false,
  queue: [],
};

function ensureStoreFile() {
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ items: {}, index: {} }, null, 2));
  }
}

function readStore() {
  ensureStoreFile();
  const raw = fs.readFileSync(STORE_FILE, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw || "{}");
  const items = parsed.items && typeof parsed.items === "object" ? parsed.items : {};
  const index = parsed.index && typeof parsed.index === "object" ? parsed.index : {};
  return { items, index };
}

function writeStore(store) {
  const tempFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2));
  fs.renameSync(tempFile, STORE_FILE);
}

function randomAliasSegment(length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALIAS_CHARS[bytes[i] % ALIAS_CHARS.length];
  }
  return out;
}

function normalizePool(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!text || text === POOL_A || text === "POOL_A" || text === "1") return POOL_A;
  if (text === POOL_B || text === "POOL_B" || text === "2") return POOL_B;
  if (text === POOL_C || text === "POOL_C" || text === "3") return POOL_C;
  throw new Error("pool is invalid.");
}

function detectAliasPool(aliasRaw) {
  const alias = normalizeAlias(aliasRaw);
  if (POOL_A_ALIAS_PATTERN.test(alias)) return POOL_A;
  if (POOL_B_ALIAS_PATTERN.test(alias)) return POOL_B;
  if (POOL_C_ALIAS_PATTERN.test(alias)) return POOL_C;
  return "";
}

function aliasSegmentsForPool(poolRaw) {
  return ALIAS_SEGMENTS_BY_POOL[normalizePool(poolRaw)];
}

function mappedPool(mapped, alias) {
  if (mapped && mapped.pool) return normalizePool(mapped.pool);
  return detectAliasPool(alias) || POOL_A;
}

function generateAlias(existingMap, poolRaw = POOL_A) {
  const segments = aliasSegmentsForPool(poolRaw);
  for (let i = 0; i < 2000; i += 1) {
    const alias = segments.map((segmentLength) => randomAliasSegment(segmentLength)).join("-");
    if (!existingMap[alias]) {
      return alias;
    }
  }
  throw new Error("Unable to generate unique alias CDKEY.");
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Admin-Password",
  });
  res.end(body);
}

function htmlResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Body too large."));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeAlias(alias) {
  return String(alias || "").trim().toUpperCase();
}

function normalizeCdkey(cdkey) {
  return String(cdkey || "").trim();
}

function normalizeForceValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value > 0 ? 1 : 0;
  const text = String(value || "").trim().toLowerCase();
  if (!text) return 0;
  if (text === "1" || text === "true" || text === "yes" || text === "on") return 1;
  return 0;
}

function parseSessionInfo(sessionInfo) {
  let parsed;
  try {
    parsed = JSON.parse(String(sessionInfo || ""));
  } catch {
    throw new Error("session_info invalid.");
  }
  return parsed && typeof parsed === "object" ? parsed : {};
}

function normalizeCdkeyForIndex(cdkey) {
  return String(cdkey || "").trim().toUpperCase();
}

function realCdkeyIndexKey(cdkey, poolRaw = POOL_A) {
  const pool = normalizePool(poolRaw);
  const normalized = normalizeCdkeyForIndex(cdkey);
  if (pool === POOL_B) return `${REAL_CDKEY_INDEX_PREFIX}${POOL_B}::${normalized}`;
  if (pool === POOL_C) return `${REAL_CDKEY_INDEX_PREFIX}${POOL_C}::${normalized}`;
  return `${REAL_CDKEY_INDEX_PREFIX}${normalized}`;
}

function optionalString(value) {
  return String(value || "").trim();
}

function parseCdkeyLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeReindexLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return 20;
  return Math.max(1, Math.min(40, parsed));
}

function resolveIndexedAlias(store, cdkey, poolRaw = POOL_A) {
  const pool = normalizePool(poolRaw);
  const reverseKey = realCdkeyIndexKey(cdkey, pool);
  const alias = normalizeAlias(store.index[reverseKey] || "");
  if (!alias || detectAliasPool(alias) !== pool) return "";
  const mapped = store.items[alias];
  if (
    !mapped ||
    normalizeCdkeyForIndex(mapped.cdkey) !== normalizeCdkeyForIndex(cdkey) ||
    mappedPool(mapped, alias) !== pool
  ) {
    delete store.index[reverseKey];
    return "";
  }
  return alias;
}

function storeAliasWithIndex(store, realCdkey, poolRaw = POOL_A) {
  const pool = normalizePool(poolRaw);
  const reverseKey = realCdkeyIndexKey(realCdkey, pool);
  const indexedAlias = resolveIndexedAlias(store, realCdkey, pool);
  if (indexedAlias) {
    return { alias: indexedAlias, created: false, pool };
  }

  const alias = generateAlias(store.items, pool);
  const cdkeyTrimmed = String(realCdkey || "").trim();
  const normalizedCdkey = normalizeCdkeyForIndex(cdkeyTrimmed);
  store.items[alias] = {
    cdkey: cdkeyTrimmed,
    cdkey_normalized: normalizedCdkey,
    pool,
    created_at: new Date().toISOString(),
  };
  store.index[reverseKey] = alias;
  return { alias, created: true, pool };
}

function lookupAliasMapping(store, aliasRaw) {
  const alias = normalizeAlias(aliasRaw);
  const pool = detectAliasPool(alias);
  if (!pool) {
    return { alias_cdkey: alias, cdkey: "", pool: "", created_at: "", found: false };
  }

  const mapped = store.items[alias];
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

function reindexStore(store, cursorRaw, limitRaw) {
  const cursorParsed = Number.parseInt(optionalString(cursorRaw) || "0", 10);
  const cursor = Number.isNaN(cursorParsed) ? 0 : Math.max(0, cursorParsed);
  const limit = normalizeReindexLimit(limitRaw);

  const aliasKeys = Object.keys(store.items)
    .filter((alias) => Boolean(detectAliasPool(alias)))
    .sort();
  const page = aliasKeys.slice(cursor, cursor + limit);

  let processed = 0;
  let fixed = 0;
  for (const alias of page) {
    const mapped = store.items[alias];
    if (!mapped || !mapped.cdkey) continue;
    processed += 1;
    const reverseKey = realCdkeyIndexKey(mapped.cdkey, detectAliasPool(alias));
    if (store.index[reverseKey] !== alias) {
      store.index[reverseKey] = alias;
      fixed += 1;
    }
  }

  const nextCursorNum = cursor + page.length;
  const done = nextCursorNum >= aliasKeys.length;
  return {
    processed,
    fixed,
    next_cursor: done ? "" : String(nextCursorNum),
    done,
  };
}

function targetApiBaseForPool(poolRaw) {
  const pool = normalizePool(poolRaw);
  if (pool === POOL_B) {
    if (!POOL_B_TARGET_API_BASE) throw new Error("POOL_B_TARGET_API_BASE is not configured.");
    return POOL_B_TARGET_API_BASE;
  }
  if (pool === POOL_C) {
    if (!POOL_C_TARGET_API_BASE) throw new Error("POOL_C_TARGET_API_BASE is not configured.");
    return POOL_C_TARGET_API_BASE;
  }
  return TARGET_API_BASE;
}

function shouldFallbackActivate(targetBody) {
  if (!targetBody || targetBody.success === true) return false;
  const msg = String(targetBody.msg || "");
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
  const parsed = parseSessionInfo(sessionInfo);
  return {
    platform: "chatgpt",
    data: {
      user: parsed.user,
      account: parsed.account,
      accessToken: parsed.accessToken,
    },
  };
}

async function callDuolgTarget(base, pathname, payload) {
  if (pathname === "/check") {
    if (!isDuolgCdkFormat(payload.cdkey)) return { http_status: 200, body: { success: false, msg: "INVALID_CDK_FORMAT", data: "" } };
    const result = await callTarget(base, "/external/cdks/filter-unused", { cdks: [payload.cdkey] });
    const normalized = normalizeDuolgResult(result.body);
    if (!normalized.success) return { http_status: result.http_status, body: normalized };
    const cdks = Array.isArray(result.body?.data?.cdks) ? result.body.data.cdks : [];
    const usable = cdks.includes(payload.cdkey);
    return {
      http_status: result.http_status,
      body: { success: usable, msg: usable ? "ok" : "CDKEY unavailable", data: { cdkey: payload.cdkey, available: usable } },
    };
  }

  if (pathname === "/activate") {
    let platformCredential;
    try {
      platformCredential = duolgPlatformCredential(payload.session_info);
    } catch (error) {
      return {
        http_status: 200,
        body: { success: false, msg: String(error?.message || "session_info invalid."), data: "" },
      };
    }
    const verifyPayload = { cdk: payload.cdkey, platformCredential };
    const verifyResult = await callTarget(base, "/external/redeem/verify", verifyPayload);
    const normalizedVerify = normalizeDuolgResult(verifyResult.body);
    if (!normalizedVerify.success) return { http_status: verifyResult.http_status, body: normalizedVerify };

    const confirmPayload = { cdk: payload.cdkey, confirm: true, platformCredential };
    const confirmResult = await callTarget(base, "/external/redeem/confirm", confirmPayload);
    return { http_status: confirmResult.http_status, body: normalizeDuolgResult(confirmResult.body) };
  }

  return callTarget(base, pathname, payload);
}

function normalizeFerriResult(result) {
  if (!result || typeof result !== "object") return { success: false, msg: "ferri request failed", data: "" };
  if (result.ok === true || result.success === true) return { success: true, msg: String(result.message || result.msg || "ok"), data: result };
  return { success: false, msg: String(result.error || result.message || result.msg || "ferri request failed"), data: result };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callFerriTarget(base, pathname, payload) {
  if (pathname === "/check") {
    const result = await callTarget(base, "/cards/verify", { code: String(payload.cdkey || "").trim().toUpperCase() });
    return { http_status: result.http_status, body: normalizeFerriResult(result.body) };
  }

  if (pathname === "/activate") {
    const startResult = await callTarget(base, "/workflow/start", {
      card_code: String(payload.cdkey || "").trim().toUpperCase(),
      token_snapshot: String(payload.session_info || "").trim(),
    });
    const normalizedStart = normalizeFerriResult(startResult.body);
    if (!normalizedStart.success) return { http_status: startResult.http_status, body: normalizedStart };

    const jobId = String(startResult.body?.job?.id || "").trim();
    if (!jobId) return { http_status: startResult.http_status, body: { success: false, msg: "ferri workflow job id missing", data: startResult.body } };

    for (let i = 0; i < 12; i += 1) {
      await sleep(1500);
      const statusResult = await fetchTargetJson(`${base}/workflow/status?id=${encodeURIComponent(jobId)}`);
      const job = statusResult.body?.job || {};
      if (job.status === "queued" || job.status === "running") continue;
      if (job.result) return { http_status: statusResult.http_status, body: normalizeFerriResult(job.result) };
      return { http_status: statusResult.http_status, body: normalizeFerriResult(statusResult.body) };
    }

    return { http_status: startResult.http_status, body: { success: false, msg: "ferri workflow still running", data: { job_id: jobId } } };
  }

  return callTarget(base, pathname, payload);
}

async function callPoolTarget(pool, pathname, payload) {
  const normalizedPool = normalizePool(pool);
  if (normalizedPool === POOL_B) {
    return callDuolgTarget(targetApiBaseForPool(POOL_B), pathname, payload);
  }
  if (normalizedPool === POOL_C) {
    return callFerriTarget(targetApiBaseForPool(POOL_C), pathname, payload);
  }
  return callTarget(TARGET_API_BASE, pathname, payload);
}

async function callTarget(base, pathname, payload) {
  try {
    const response = await fetch(`${base}${pathname}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { success: false, msg: text, data: "" };
    }

    return {
      http_status: response.status,
      body: parsed,
    };
  } catch (error) {
    return {
      http_status: 200,
      body: {
        success: false,
        msg: "套壳网站接口请求失败",
        data: "",
      },
    };
  }
}

function unwrapTargetMessage(targetBody) {
  if (!targetBody || typeof targetBody !== "object") return "";
  return String(targetBody.msg || "").trim();
}

function requiredString(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}

function resolveAdminPassword(req, body) {
  const headerPassword = String(req.headers["x-admin-password"] || "").trim();
  if (headerPassword) return headerPassword;
  return String(body?.admin_password || "").trim();
}

function assertAdminPassword(req, body) {
  const password = resolveAdminPassword(req, body);
  if (password !== ADMIN_PASSWORD) {
    const error = new Error("管理密码错误");
    error.statusCode = 401;
    throw error;
  }
}

async function requestSubscriptionGateway(pathname, token) {
  try {
    const response = await fetch(`${SUBSCRIPTION_GATEWAY_BASE}${pathname}`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
    return { ok: response.ok, status: response.status, body: parsed, path: pathname };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { message: String(error?.message || "request failed") },
      path: pathname,
    };
  }
}

function lookupNestedValue(source, path) {
  let current = source;
  for (const part of path) {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function isAlreadyCancelledSubscription(info) {
  if (!info || typeof info !== "object") return false;
  if (info.auto_renew === false) return true;
  const markers = [
    ["cancel_at_period_end"],
    ["subscription", "cancel_at_period_end"],
    ["will_cancel"],
    ["subscription", "will_cancel"],
    ["auto_renew"],
    ["subscription", "auto_renew"],
    ["renew"],
    ["subscription", "renew"],
  ];
  for (const marker of markers) {
    const value = lookupNestedValue(info, marker);
    if (value === true && marker[marker.length - 1].includes("cancel")) return true;
    if (value === false && (marker[marker.length - 1] === "auto_renew" || marker[marker.length - 1] === "renew")) {
      return true;
    }
  }
  return false;
}

function normalizeCancelFailureMessage(status, rawMessage) {
  const raw = String(rawMessage || "").trim();
  if (raw === "session_info invalid." || /Invalid JSON format/i.test(raw)) {
    return "取消续费失败：session_info 不是有效的 JSON 格式";
  }
  if (/token.*missing|token.*invalid/i.test(raw) || (/token/i.test(raw) && /(无效|已过期|过期)/.test(raw))) {
    return "取消续费失败：session_info 无效或缺少必要登录信息";
  }
  if (status === 401 || status === 403) return "取消续费失败：登录状态已失效，请重新获取 session_info";
  if (status === 404 || status === 405) return "当前账号暂不支持自动取消续费";
  if (/access.?token/i.test(raw)) return "取消续费失败：session_info 缺少有效 accessToken";
  if (/unauthorized|forbidden/i.test(raw)) return "取消续费失败：登录状态已失效，请重新获取 session_info";
  if (/not found/i.test(raw)) return "当前账号暂不支持自动取消续费";
  if (!raw) return "取消续费失败，请稍后重试";
  return `取消续费失败：${raw}`;
}

async function autoCancelSubscription(sessionInfo) {
  let parsed;
  try {
    parsed = parseSessionInfo(sessionInfo);
  } catch (error) {
    return {
      status: "failed",
      success: false,
      message: normalizeCancelFailureMessage(400, error?.message),
    };
  }

  const accessToken = String(parsed.accessToken || "").trim();
  if (!accessToken) {
    return {
      status: "failed",
      success: false,
      message: "取消续费失败：session_info 缺少 accessToken",
    };
  }

  const infoResult = await requestSubscriptionGateway(SUBSCRIPTION_INFO_PATH, parsed);
  if (!infoResult.ok) {
    return {
      status: infoResult.status === 404 || infoResult.status === 405 ? "unsupported" : "failed",
      success: false,
      message: normalizeCancelFailureMessage(infoResult.status, infoResult.body?.message),
    };
  }

  if (infoResult.body?.code !== 200) {
    return {
      status: "failed",
      success: false,
      message: normalizeCancelFailureMessage(infoResult.status, infoResult.body?.message),
    };
  }

  const subscriptionInfo = infoResult.body?.data;
  if (!subscriptionInfo) {
    return {
      status: "unsupported",
      success: false,
      message: infoResult.body?.message || "当前账号未检测到可取消的订阅",
      info_path: infoResult.path,
    };
  }

  if (isAlreadyCancelledSubscription(subscriptionInfo)) {
    return {
      status: "success",
      success: true,
      message: "已处于取消续费状态",
      info_path: infoResult.path,
    };
  }

  const cancelResult = await requestSubscriptionGateway(SUBSCRIPTION_CANCEL_PATH, parsed);
  if (!cancelResult.ok) {
    return {
      status: cancelResult.status === 404 || cancelResult.status === 405 ? "unsupported" : "failed",
      success: false,
      message: normalizeCancelFailureMessage(cancelResult.status, cancelResult.body?.message),
      info_path: infoResult.path,
      cancel_path: SUBSCRIPTION_CANCEL_PATH,
    };
  }

  if (cancelResult.body?.code !== 200) {
    return {
      status: "failed",
      success: false,
      message: normalizeCancelFailureMessage(cancelResult.status, cancelResult.body?.message),
      info_path: infoResult.path,
      cancel_path: SUBSCRIPTION_CANCEL_PATH,
    };
  }

  return {
    status: "success",
    success: true,
    message: cancelResult.body?.message || "已自动取消续费",
    info_path: infoResult.path,
    cancel_path: SUBSCRIPTION_CANCEL_PATH,
  };
}

function acquireActivationSlot() {
  if (!activationGate.active) {
    activationGate.active = true;
    return Promise.resolve(true);
  }

  return new Promise((resolve, reject) => {
    const ticket = { resolve, reject, done: false, timer: null };
    ticket.timer = setTimeout(() => {
      if (ticket.done) return;
      ticket.done = true;
      activationGate.queue = activationGate.queue.filter((item) => item !== ticket);
      const error = new Error(ACTIVATION_BUSY_MESSAGE);
      error.busy = true;
      reject(error);
    }, ACTIVATION_GATE_WAIT_MS);
    activationGate.queue.push(ticket);
  });
}

function releaseActivationSlot() {
  while (activationGate.queue.length) {
    const next = activationGate.queue.shift();
    if (!next || next.done) continue;
    next.done = true;
    clearTimeout(next.timer);
    activationGate.active = true;
    next.resolve(true);
    return;
  }
  activationGate.active = false;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Admin-Password",
    });
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && requestUrl.pathname === "/_hidden/alias-admin") {
      const html = fs.readFileSync(ADMIN_PAGE_FILE, "utf8").replace(/^\uFEFF/, "");
      htmlResponse(res, 200, html);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/v1/health") {
      jsonResponse(res, 200, {
        success: true,
        msg: "ok",
        data: {
          target_api_base: TARGET_API_BASE,
        },
      });
      return;
    }

    if (
      req.method === "POST" &&
      (requestUrl.pathname === "/v1/alias/create" || requestUrl.pathname === "/v1/admin/alias/create")
    ) {
      const body = await parseJsonBody(req);
      assertAdminPassword(req, body);
      const realCdkey = requiredString(body.cdkey, "cdkey");
      const store = readStore();
      const result = storeAliasWithIndex(store, realCdkey, body.pool);
      writeStore(store);

      jsonResponse(res, 200, {
        success: true,
        msg: result.created ? "alias created" : "alias exists",
        data: {
          alias_cdkey: result.alias,
          created: result.created,
          pool: result.pool,
        },
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/admin/alias/lookup") {
      const body = await parseJsonBody(req);
      assertAdminPassword(req, body);
      const item = lookupAliasMapping(readStore(), requiredString(body.alias_cdkey, "alias_cdkey"));

      if (!item.found) {
        jsonResponse(res, 200, {
          success: false,
          msg: "CDKEY not found",
          data: "",
        });
        return;
      }

      jsonResponse(res, 200, {
        success: true,
        msg: "ok",
        data: item,
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/admin/alias/lookup-from-list") {
      const body = await parseJsonBody(req);
      assertAdminPassword(req, body);

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

      const store = readStore();
      const items = aliases.map((alias) => lookupAliasMapping(store, alias));
      const foundCount = items.filter((item) => item.found).length;

      jsonResponse(res, 200, {
        success: true,
        msg: "lookup batch processed",
        data: {
          count: items.length,
          found_count: foundCount,
          missing_count: items.length - foundCount,
          items,
        },
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/admin/alias/reindex") {
      const body = await parseJsonBody(req);
      assertAdminPassword(req, body);

      const store = readStore();
      const data = reindexStore(store, body.cursor, body.limit);
      writeStore(store);

      jsonResponse(res, 200, {
        success: true,
        msg: "reindex ok",
        data,
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/alias/check") {
      const body = await parseJsonBody(req);
      const item = lookupAliasMapping(readStore(), requiredString(body.alias_cdkey, "alias_cdkey"));

      if (!item.found) {
        jsonResponse(res, 200, {
          success: false,
          msg: "未检测到CDKEY",
          data: "",
        });
        return;
      }

      const rawTargetResult = await callPoolTarget(item.pool, "/check", {
        cdkey: normalizeCdkey(item.cdkey),
      });
      const targetResult = presentPoolTargetResult(item.pool, "/check", rawTargetResult.body, item.alias_cdkey, item.cdkey);
      const targetMsg = unwrapTargetMessage(targetResult);

      jsonResponse(res, 200, {
        success: Boolean(targetResult && targetResult.success),
        msg: targetMsg || "ok",
        data: {
          alias_cdkey: item.alias_cdkey,
          target_result: targetResult,
        },
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/alias/activate") {
      const body = await parseJsonBody(req);
      const alias = normalizeAlias(requiredString(body.alias_cdkey, "alias_cdkey"));
      const sessionInfo = requiredString(body.session_info, "session_info");
      const force = normalizeForceValue(body.force);

      const pool = detectAliasPool(alias);
      if (!pool) {
        throw new Error("alias_cdkey format invalid.");
      }

      const store = readStore();
      const mapped = store.items[alias];
      if (!mapped) {
        jsonResponse(res, 200, {
          success: false,
          msg: "未检测到CDKEY",
          data: "",
        });
        return;
      }

      const targetPayload = {
        cdkey: normalizeCdkey(mapped.cdkey),
        session_info: sessionInfo,
        force,
      };
      let acquired = false;
      try {
        acquired = await acquireActivationSlot();
      } catch (error) {
        if (error && error.busy === true) {
          jsonResponse(res, 200, {
            success: false,
            msg: ACTIVATION_BUSY_MESSAGE,
            data: "",
          });
          return;
        }
        throw error;
      }

      try {
        const primaryResult = await callPoolTarget(pool, "/activate", targetPayload);
        const fallbackUsed = pool === POOL_A && shouldFallbackActivate(primaryResult.body);
        const rawResult = fallbackUsed
          ? await callTarget(FALLBACK_TARGET_API_BASE, "/activate", targetPayload)
          : primaryResult;
        const targetResult = presentPoolTargetResult(pool, "/activate", rawResult.body, alias, mapped.cdkey);
        const targetMsg = unwrapTargetMessage(targetResult);
        const cancelResult = targetResult && targetResult.success === true
          ? await autoCancelSubscription(sessionInfo)
          : null;

        jsonResponse(res, 200, {
          success: Boolean(targetResult && targetResult.success),
          msg: targetMsg || "ok",
          data: {
            alias_cdkey: alias,
            target_result: targetResult,
            cancel_result: cancelResult,
            fallback_used: fallbackUsed,
            attempt_count: fallbackUsed ? 2 : 1,
          },
        });
      } finally {
        if (acquired) releaseActivationSlot();
      }
      return;
    }

    jsonResponse(res, 404, {
      success: false,
      msg: "not found",
      data: "",
    });
  } catch (error) {
    jsonResponse(res, Number(error.statusCode) || 400, {
      success: false,
      msg: error.message || "bad request",
      data: "",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Alias CDKEY service started at http://127.0.0.1:${PORT}`);
  console.log(`Target API base: ${TARGET_API_BASE}`);
});
