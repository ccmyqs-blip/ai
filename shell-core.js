const ALIAS_API_BASE = (() => {
  const raw = window.GPT_SHELL_CONFIG?.aliasApiBaseUrl;
  if (!raw) return "http://127.0.0.1:4190/v1/alias";
  return raw.replace(/\/+$/, "");
})();

export function createShellApp(localeText, options = {}) {
  const currentLangRef = { value: options.defaultLang || "zh" };
  const state = {
    checkRequested: false,
    activateRequested: false,
  };

  const elements = {
    cdkeyInput: document.getElementById("cdkey-input"),
    sessionInput: document.getElementById("session-info"),
    checkButton: document.getElementById("check-button"),
    activateButton: document.getElementById("activate-button"),
    checkResult: document.getElementById("check-result"),
    activateResult: document.getElementById("activate-result"),
    checkResultCard: document.getElementById("check-result-card"),
    activateResultCard: document.getElementById("activate-result-card"),
    forceRechargeInput: document.getElementById("force-recharge"),
    langButtons: Array.from(document.querySelectorAll(".lang")),
  };

  const hooks = {
    onCheckComplete: typeof options.onCheckComplete === "function" ? options.onCheckComplete : null,
    onActivateComplete:
      typeof options.onActivateComplete === "function" ? options.onActivateComplete : null,
    onLanguageApplied:
      typeof options.onLanguageApplied === "function" ? options.onLanguageApplied : null,
  };

  elements.checkButton?.addEventListener("click", () =>
    triggerCheck(localeText, currentLangRef, state, elements, hooks)
  );
  elements.activateButton?.addEventListener("click", () =>
    triggerActivate(localeText, currentLangRef, state, elements, hooks)
  );
  elements.langButtons.forEach((button) => {
    button.addEventListener("click", () =>
      applyLanguage(localeText, currentLangRef, state, elements, hooks, button.dataset.lang)
    );
  });

  applyLanguage(localeText, currentLangRef, state, elements, hooks, currentLangRef.value);

  return {
    async check() {
      return triggerCheck(localeText, currentLangRef, state, elements, hooks);
    },
    async activate() {
      return triggerActivate(localeText, currentLangRef, state, elements, hooks);
    },
    setLanguage(lang) {
      applyLanguage(localeText, currentLangRef, state, elements, hooks, lang);
    },
    getLanguage() {
      return currentLangRef.value;
    },
    getElements() {
      return elements;
    },
  };
}

async function triggerCheck(localeText, currentLangRef, state, elements, hooks) {
  const aliasCdkey = elements.cdkeyInput?.value.trim() || "";
  revealResult(elements.checkResultCard);

  if (!aliasCdkey) {
    state.checkRequested = true;
    const displayText = text(localeText, currentLangRef, "needCdkeyForCheck");
    renderResult(elements.checkResult, displayText, true);
    const summary = { success: false, isError: true, displayText, payload: null, reason: "missing_cdkey" };
    hooks.onCheckComplete?.(summary);
    return summary;
  }

  setLoading(elements.checkButton, true, text(localeText, currentLangRef, "checkLoading"));
  try {
    const payload = await postAlias("check", { alias_cdkey: aliasCdkey });
    const isError = !payload?.success;
    const displayText = formatDisplayText(payload, localeText, currentLangRef);
    state.checkRequested = true;
    renderResult(elements.checkResult, displayText, isError);
    const summary = { success: !isError, isError, displayText, payload, reason: isError ? "api_failed" : "ok" };
    hooks.onCheckComplete?.(summary);
    return summary;
  } catch (error) {
    const displayText = error.message || text(localeText, currentLangRef, "requestFailed");
    state.checkRequested = true;
    renderResult(elements.checkResult, displayText, true);
    const summary = {
      success: false,
      isError: true,
      displayText,
      payload: null,
      reason: "network_failed",
      error,
    };
    hooks.onCheckComplete?.(summary);
    return summary;
  } finally {
    setLoading(elements.checkButton, false, text(localeText, currentLangRef, "checkButton"));
  }
}

async function triggerActivate(localeText, currentLangRef, state, elements, hooks) {
  const aliasCdkey = elements.cdkeyInput?.value.trim() || "";
  const sessionInfo = elements.sessionInput?.value.trim() || "";
  const forceRecharge = elements.forceRechargeInput?.checked === true;
  revealResult(elements.activateResultCard);

  if (!aliasCdkey) {
    state.activateRequested = true;
    const displayText = text(localeText, currentLangRef, "needCdkeyForActivate");
    renderResult(elements.activateResult, displayText, true);
    const summary = { success: false, isError: true, displayText, payload: null, reason: "missing_cdkey" };
    hooks.onActivateComplete?.(summary);
    return summary;
  }

  if (!sessionInfo) {
    state.activateRequested = true;
    const displayText = text(localeText, currentLangRef, "needSessionInfo");
    renderResult(elements.activateResult, displayText, true);
    const summary = {
      success: false,
      isError: true,
      displayText,
      payload: null,
      reason: "missing_session",
    };
    hooks.onActivateComplete?.(summary);
    return summary;
  }

  try {
    JSON.parse(sessionInfo);
  } catch {
    state.activateRequested = true;
    const displayText = text(localeText, currentLangRef, "invalidSession");
    renderResult(elements.activateResult, displayText, true);
    const summary = {
      success: false,
      isError: true,
      displayText,
      payload: null,
      reason: "invalid_session",
    };
    hooks.onActivateComplete?.(summary);
    return summary;
  }

  setLoading(elements.activateButton, true, text(localeText, currentLangRef, "activateLoading"));
  try {
    const payload = await postAlias("activate", {
      alias_cdkey: aliasCdkey,
      session_info: sessionInfo,
      force: forceRecharge ? 1 : 0,
    });
    const isError = !payload?.success;
    const displayText = formatDisplayText(payload, localeText, currentLangRef);
    state.activateRequested = true;
    renderResult(elements.activateResult, displayText, isError);
    const summary = { success: !isError, isError, displayText, payload, reason: isError ? "api_failed" : "ok" };
    hooks.onActivateComplete?.(summary);
    return summary;
  } catch (error) {
    const displayText = error.message || text(localeText, currentLangRef, "activateFailed");
    state.activateRequested = true;
    renderResult(elements.activateResult, displayText, true);
    const summary = {
      success: false,
      isError: true,
      displayText,
      payload: null,
      reason: "network_failed",
      error,
    };
    hooks.onActivateComplete?.(summary);
    return summary;
  } finally {
    setLoading(elements.activateButton, false, text(localeText, currentLangRef, "activateButton"));
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
  if (!element) return;
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
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = label;
}

function revealResult(card) {
  if (!card) return;
  card.classList.remove("is-hidden");
  card.classList.add("is-visible");
}

function formatDisplayText(payload, localeText, currentLangRef) {
  if (!payload || typeof payload !== "object") return formatPayloadText(payload, localeText, currentLangRef);
  const aliasCdkey = normalizeCdkey(payload?.data?.alias_cdkey);

  if (payload.success === false) {
    const msg = String(payload.msg || "").trim();
    if (msg) return replaceOriginalCdkeyWithAlias(msg, aliasCdkey);
    return text(localeText, currentLangRef, "notFoundCdkey");
  }

  const targetResult = payload?.data?.target_result;
  if (targetResult && typeof targetResult === "object") {
    return replaceOriginalCdkeyWithAlias(
      formatPayloadText(targetResult, localeText, currentLangRef),
      aliasCdkey
    );
  }

  return replaceOriginalCdkeyWithAlias(
    formatPayloadText(payload, localeText, currentLangRef),
    aliasCdkey
  );
}

function formatPayloadText(payload, localeText, currentLangRef) {
  if (payload === null || typeof payload === "undefined") return "";
  if (typeof payload !== "object") return String(payload).trim();

  const lines = [];
  collectPayloadTextValues(payload, lines);
  return lines.length ? lines.join("\n") : text(localeText, currentLangRef, "noTextResult");
}

function collectPayloadTextValues(value, lines) {
  if (value === null || typeof value === "undefined") return;

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

function normalizeCdkey(value) {
  return String(value || "").trim().toUpperCase();
}

function replaceOriginalCdkeyWithAlias(content, aliasCdkey) {
  const alias = normalizeCdkey(aliasCdkey);
  if (!alias) return content;
  const raw = String(content || "");
  const cdkeyPattern = /\b[A-Z0-9]{4,6}(?:-[A-Z0-9]{4,6}){2,4}\b/gi;
  return raw.replace(cdkeyPattern, () => alias);
}

function text(localeText, currentLangRef, key) {
  return localeText[currentLangRef.value]?.[key] || localeText.zh?.[key] || "";
}

function applyLanguage(localeText, currentLangRef, state, elements, hooks, lang) {
  currentLangRef.value = localeText[lang] ? lang : "zh";
  document.documentElement.lang = currentLangRef.value;
  document.title = text(localeText, currentLangRef, "pageTitle");

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    node.textContent = text(localeText, currentLangRef, key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.dataset.i18nPlaceholder;
    node.placeholder = text(localeText, currentLangRef, key);
  });

  elements.langButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === currentLangRef.value);
  });

  if (!state.checkRequested) {
    renderResult(elements.checkResult, text(localeText, currentLangRef, "notRequested"));
  }

  if (!state.activateRequested) {
    renderResult(elements.activateResult, text(localeText, currentLangRef, "notRequested"));
  }

  hooks.onLanguageApplied?.(currentLangRef.value, { ...elements });
}
