"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number.parseInt(process.env.PORT || "4190", 10);
const TARGET_API_BASE = (process.env.TARGET_API_BASE || "https://gpt.86gamestore.com/api").replace(/\/+$/, "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Cc123123.";
const STORE_FILE = path.join(__dirname, "alias-map.json");
const ADMIN_PAGE_FILE = path.join(__dirname, "admin.html");
const ALIAS_SEGMENTS = [4, 5, 4, 4];
const ALIAS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALIAS_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function ensureStoreFile() {
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ items: {} }, null, 2));
  }
}

function readStore() {
  ensureStoreFile();
  const raw = fs.readFileSync(STORE_FILE, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw || "{}");
  if (!parsed.items || typeof parsed.items !== "object") {
    return { items: {} };
  }
  return parsed;
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

function generateAlias(existingMap) {
  for (let i = 0; i < 2000; i += 1) {
    const alias = ALIAS_SEGMENTS.map((segmentLength) => randomAliasSegment(segmentLength)).join("-");
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

async function callTarget(pathname, payload) {
  try {
    const response = await fetch(`${TARGET_API_BASE}${pathname}`, {
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
      const alias = generateAlias(store.items);
      store.items[alias] = {
        cdkey: realCdkey,
        created_at: new Date().toISOString(),
      };
      writeStore(store);

      jsonResponse(res, 200, {
        success: true,
        msg: "alias created",
        data: {
          alias_cdkey: alias,
        },
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/alias/check") {
      const body = await parseJsonBody(req);
      const alias = normalizeAlias(requiredString(body.alias_cdkey, "alias_cdkey"));

      if (!ALIAS_PATTERN.test(alias)) {
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

      const result = await callTarget("/check", {
        cdkey: normalizeCdkey(mapped.cdkey),
      });
      const targetMsg = unwrapTargetMessage(result.body);

      jsonResponse(res, 200, {
        success: Boolean(result.body && result.body.success),
        msg: targetMsg || "ok",
        data: {
          alias_cdkey: alias,
          target_result: result.body,
        },
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/alias/activate") {
      const body = await parseJsonBody(req);
      const alias = normalizeAlias(requiredString(body.alias_cdkey, "alias_cdkey"));
      const sessionInfo = requiredString(body.session_info, "session_info");

      if (!ALIAS_PATTERN.test(alias)) {
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

      const result = await callTarget("/activate", {
        cdkey: normalizeCdkey(mapped.cdkey),
        session_info: sessionInfo,
      });
      const targetMsg = unwrapTargetMessage(result.body);

      jsonResponse(res, 200, {
        success: Boolean(result.body && result.body.success),
        msg: targetMsg || "ok",
        data: {
          alias_cdkey: alias,
          target_result: result.body,
        },
      });
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
