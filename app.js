const ALIAS_API_BASE = (() => {
  const raw = window.GPT_SHELL_CONFIG?.aliasApiBaseUrl;
  if (!raw) return "http://127.0.0.1:4190/v1/alias";
  return raw.replace(/\/+$/, "");
})();

const localeText = {
  zh: {
    pageTitle: "AI助手充值系统",
    brandTitle: "AI助手充值系统",
    openChatgpt: "第一步：打开ChatGPT",
    openAuthSession: "第二步：打开AuthSession页面",
    guideTitle: "操作指南",
    guideStep1Title: "卡密查询",
    guideStep1Body: "请输入您的二次CDKEY并点击立即验证。",
    guideStep2Title: "确认登录状态",
    guideStep2Body: "请确认您已在 chatgpt.com 登录账户，然后选择下一步操作。",
    guideStep3Title: "提交充值信息",
    guideStep3Body: "点击打开AuthSession页面按钮，将页面内的所有内容复制在session_info输入框内，点击开始激活按钮。",
    cdkeyLabel: "请输入二次CDKEY",
    cdkeyPlaceholder: "例如：5S8F-S888G-5G5G-55HH",
    checkButton: "立即验证",
    activateButton: "开始激活",
    sessionLabel: "session_info（JSON）",
    sessionPlaceholder:
      '{"account":{"id":"user-xxx","planType":"free"},"accessToken":"ey...","user":{"email":"test@example.com"}}',
    checkResultTitle: "查验结果",
    activateResultTitle: "激活结果",
    notRequested: "尚未请求",
    checkLoading: "请求状态...",
    activateLoading: "激活中...",
    needCdkeyForCheck: "请输入二次CDKEY后再执行查验。",
    needCdkeyForActivate: "请先输入二次CDKEY。",
    needSessionInfo: "激活需要填写 session_info。",
    invalidSession: "session_info 不是合法的 JSON，请检查后重传。",
    requestFailed: "无法连接接口，请稍后重试。",
    activateFailed: "激活失败，请稍后重试。",
    notFoundCdkey: "未检测到CDKEY",
    noTextResult: "未提取到可展示的文本结果。",
  },
  en: {
    pageTitle: "AI Assistant Recharge System",
    brandTitle: "AI Assistant Recharge System",
    openChatgpt: "Step 1: Open ChatGPT",
    openAuthSession: "Step 2: Open AuthSession Page",
    guideTitle: "Guide",
    guideStep1Title: "Alias CDKEY Check",
    guideStep1Body: "Enter your alias CDKEY and click Verify.",
    guideStep2Title: "Confirm Login Status",
    guideStep2Body: "Make sure you are logged in to chatgpt.com before continuing.",
    guideStep3Title: "Submit Recharge Info",
    guideStep3Body: "Click Open AuthSession Page, then copy all page content into the session_info input.",
    cdkeyLabel: "Enter Alias CDKEY",
    cdkeyPlaceholder: "Example: 5S8F-S888G-5G5G-55HH",
    checkButton: "Verify",
    activateButton: "Activate",
    sessionLabel: "session_info (JSON)",
    sessionPlaceholder:
      '{"account":{"id":"user-xxx","planType":"free"},"accessToken":"ey...","user":{"email":"test@example.com"}}',
    checkResultTitle: "Verification Result",
    activateResultTitle: "Activation Result",
    notRequested: "No request yet",
    checkLoading: "Checking...",
    activateLoading: "Activating...",
    needCdkeyForCheck: "Enter alias CDKEY before verification.",
    needCdkeyForActivate: "Enter alias CDKEY first.",
    needSessionInfo: "session_info is required for activation.",
    invalidSession: "session_info must be valid JSON.",
    requestFailed: "Unable to reach API. Please retry.",
    activateFailed: "Activation failed. Please retry.",
    notFoundCdkey: "CDKEY not detected",
    noTextResult: "No displayable text result found.",
  },
};

const cdkeyInput = document.getElementById("cdkey-input");
const sessionInput = document.getElementById("session-info");
const checkButton = document.getElementById("check-button");
const activateButton = document.getElementById("activate-button");
const checkResult = document.getElementById("check-result");
const activateResult = document.getElementById("activate-result");
const checkResultCard = document.getElementById("check-result-card");
const activateResultCard = document.getElementById("activate-result-card");
const langButtons = Array.from(document.querySelectorAll(".lang"));

let currentLang = "zh";
let checkRequested = false;
let activateRequested = false;

checkButton.addEventListener("click", () => triggerCheck());
activateButton.addEventListener("click", () => triggerActivate());
langButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

async function triggerCheck() {
  const aliasCdkey = cdkeyInput.value.trim();
  revealCheckResult();

  if (!aliasCdkey) {
    checkRequested = true;
    renderResult(checkResult, text("needCdkeyForCheck"), true);
    return;
  }

  setLoading(checkButton, true, text("checkLoading"));
  try {
    const payload = await postAlias("check", { alias_cdkey: aliasCdkey });
    checkRequested = true;
    renderResult(checkResult, formatDisplayText(payload), !payload?.success);
  } catch (error) {
    checkRequested = true;
    renderResult(checkResult, error.message || text("requestFailed"), true);
  } finally {
    setLoading(checkButton, false, text("checkButton"));
  }
}

async function triggerActivate() {
  const aliasCdkey = cdkeyInput.value.trim();
  const sessionInfo = sessionInput.value.trim();
  revealActivateResult();

  if (!aliasCdkey) {
    activateRequested = true;
    renderResult(activateResult, text("needCdkeyForActivate"), true);
    return;
  }

  if (!sessionInfo) {
    activateRequested = true;
    renderResult(activateResult, text("needSessionInfo"), true);
    return;
  }

  try {
    JSON.parse(sessionInfo);
  } catch (error) {
    activateRequested = true;
    renderResult(activateResult, text("invalidSession"), true);
    return;
  }

  setLoading(activateButton, true, text("activateLoading"));
  try {
    const payload = await postAlias("activate", {
      alias_cdkey: aliasCdkey,
      session_info: sessionInfo,
    });
    activateRequested = true;
    renderResult(activateResult, formatDisplayText(payload), !payload?.success);
  } catch (error) {
    activateRequested = true;
    renderResult(activateResult, error.message || text("activateFailed"), true);
  } finally {
    setLoading(activateButton, false, text("activateButton"));
  }
}

async function postAlias(path, body) {
  const response = await fetch(`${ALIAS_API_BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const textValue = await response.text();
    throw new Error(`API error: ${response.status} ${textValue}`);
  }

  return response.json();
}

function renderResult(element, content, isError = false) {
  if (typeof content === "string") {
    element.textContent = content;
  } else if (typeof content === "object" && content !== null) {
    element.textContent = JSON.stringify(content, null, 2);
  } else {
    element.textContent = String(content);
  }
  element.dataset.error = isError ? "true" : "false";
}

function setLoading(button, isLoading, label) {
  button.disabled = isLoading;
  button.textContent = label;
}

function revealCheckResult() {
  checkResultCard.classList.remove("is-hidden");
  checkResultCard.classList.add("is-visible");
}

function revealActivateResult() {
  activateResultCard.classList.remove("is-hidden");
  activateResultCard.classList.add("is-visible");
}

function formatDisplayText(payload) {
  if (!payload || typeof payload !== "object") return formatPayloadText(payload);

  if (payload.success === false) {
    const msg = String(payload.msg || "").trim();
    if (msg) return msg;
    return text("notFoundCdkey");
  }

  const targetResult = payload?.data?.target_result;
  if (targetResult && typeof targetResult === "object") {
    return formatPayloadText(targetResult);
  }

  return formatPayloadText(payload);
}

function formatPayloadText(payload) {
  if (payload === null || typeof payload === "undefined") return "";
  if (typeof payload !== "object") return String(payload).trim();

  const lines = [];
  collectPayloadTextValues(payload, lines);
  return lines.length ? lines.join("\n") : text("noTextResult");
}

function collectPayloadTextValues(value, lines) {
  if (value === null || typeof value === "undefined") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPayloadTextValues(item, lines));
    return;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectPayloadTextValues(item, lines));
    return;
  }

  if (typeof value !== "string") return;
  const normalized = value.trim();
  if (!normalized) return;
  if (!lines.includes(normalized)) lines.push(normalized);
}

function text(key) {
  return localeText[currentLang][key] || localeText.zh[key] || "";
}

function applyLanguage(lang) {
  currentLang = localeText[lang] ? lang : "zh";
  document.documentElement.lang = currentLang;
  document.title = text("pageTitle");

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    node.textContent = text(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.dataset.i18nPlaceholder;
    node.placeholder = text(key);
  });

  langButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === currentLang);
  });

  if (!checkRequested) {
    renderResult(checkResult, text("notRequested"));
  }

  if (!activateRequested) {
    renderResult(activateResult, text("notRequested"));
  }
}

applyLanguage("zh");
