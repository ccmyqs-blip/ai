const API_BASE_URL = (() => {
  const raw = window.GPT_SHELL_CONFIG?.apiBaseUrl;
  if (!raw) return "https://gpt.86gamestore.com/api";
  return raw.replace(/\/+$/, "");
})();

const cdkeyInput = document.getElementById("cdkey-input");
const sessionInput = document.getElementById("session-info");
const checkButton = document.getElementById("check-button");
const activateButton = document.getElementById("activate-button");
const checkResult = document.getElementById("check-result");
const activateResult = document.getElementById("activate-result");

const defaultCheckText = checkButton.textContent;
const defaultActivateText = activateButton.textContent;

checkButton.addEventListener("click", () => triggerCheck());
activateButton.addEventListener("click", () => triggerActivate());

async function triggerCheck() {
  const cdkey = cdkeyInput.value.trim();
  if (!cdkey) {
    renderResult(checkResult, "请输入 CDKEY 后再执行查验。");
    return;
  }

  setLoading(checkButton, true, "请求状态...");
  try {
    const payload = await postJson("check", { cdkey });
    renderResult(checkResult, payload);
  } catch (err) {
    renderResult(checkResult, err.message || "无法连接接口，请稍后重试。", true);
  } finally {
    setLoading(checkButton, false, defaultCheckText);
  }
}

async function triggerActivate() {
  const cdkey = cdkeyInput.value.trim();
  const sessionInfo = sessionInput.value.trim();
  if (!cdkey) {
    renderResult(activateResult, "请先输入 CDKEY。", true);
    return;
  }
  if (!sessionInfo) {
    renderResult(activateResult, "激活需要填写 session_info。", true);
    return;
  }

  try {
    JSON.parse(sessionInfo);
  } catch (err) {
    renderResult(activateResult, "session_info 不是合法的 JSON，请检查后重传。", true);
    return;
  }

  setLoading(activateButton, true, "激活中...");
  try {
    const payload = await postJson("activate", {
      cdkey,
      session_info: sessionInfo,
    });
    renderResult(activateResult, payload);
  } catch (err) {
    renderResult(activateResult, err.message || "激活失败，请稍后重试。", true);
  } finally {
    setLoading(activateButton, false, defaultActivateText);
  }
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`接口异常：${response.status} ${text}`);
  }

  const payload = await response.json();
  return payload;
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

renderResult(checkResult, "尚未请求");
renderResult(activateResult, "尚未请求");
