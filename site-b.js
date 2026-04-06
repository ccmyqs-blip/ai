import { createShellApp } from "./shell-core.js";

const localeText = {
  zh: {
    pageTitle: "GPT 礼包兑换向导",
    eyebrow: "Smart Redeem Workflow",
    brandTitle: "GPT 礼包兑换向导",
    heroSubline: "按顺序完成 4 步，减少误操作，结果实时返回。",
    step1NavTitle: "验证卡密",
    step1NavHint: "先确认 CDKEY 可用",
    step2NavTitle: "登录账户",
    step2NavHint: "确保目标账号在线",
    step3NavTitle: "验证 Session",
    step3NavHint: "粘贴并检查 session_info",
    step4NavTitle: "确认充值",
    step4NavHint: "核对后提交激活",
    step1Title: "先验证你的 CDKEY",
    step1Chip: "输入后点击验证",
    step1Body: "验证成功后会自动进入下一步，失败时请直接查看右侧结果。",
    step2Title: "保持目标账号已登录",
    step2Body: "先在新窗口打开 ChatGPT，确认要充值的账号已经登录，然后再继续下一步。",
    step3Title: "提交并检查 session_info",
    step3Body: "打开 AuthSession 页面，把页面中的完整 JSON 内容复制到下面输入框，再点击验证 Session。",
    step4Title: "确认后提交激活",
    step4Body: "最后核对卡密与会话信息。需要覆盖剩余会员时，可以勾选强制充值。",
    openChatgpt: "打开 ChatGPT",
    openAuthSession: "打开 AuthSession",
    cdkeyLabel: "CDKEY",
    cdkeyPlaceholder: "例如：5S8F-S888G-5G5G-55HH",
    checkButton: "验证",
    sessionLabel: "session_info",
    sessionPlaceholder:
      '{"account":{"id":"user-xxx","planType":"free"},"accessToken":"ey...","user":{"email":"test@example.com"}}',
    forceRechargeLabel: "放弃剩余会员时间，强制充值",
    activateButton: "开始激活",
    helperTitle: "当前操作提示",
    helperStep1: "输入 CDKEY 并点击验证。验证通过后，再继续登录和提交 Session。",
    helperStep2: "此步不提交数据，只确认目标账户已经在 ChatGPT 中登录。",
    helperStep3: "粘贴完整 session_info，先做本地结构校验，确认无误后再进入最终提交。",
    helperStep4: "确认当前卡密和 Session 状态，再执行激活请求。",
    checkResultTitle: "验证结果",
    activateResultTitle: "激活结果",
    step1ResultTag: "Step 1",
    step4ResultTag: "Step 4",
    nextStep: "下一步",
    backStep: "上一步",
    loggedInNext: "已登录，继续",
    validateSessionButton: "验证 Session",
    sessionMetaIdleTitle: "尚未验证 Session",
    sessionMetaIdleText: "请粘贴完整 JSON 后点击下方按钮。",
    sessionMetaValidTitle: "Session 验证通过",
    sessionMetaValidText: "已识别到账户信息和 accessToken，可以继续下一步。",
    sessionMetaInvalidTitle: "Session 验证失败",
    sessionMetaInvalidText: "缺少 account、user 或 accessToken 字段，请重新复制完整 JSON。",
    sessionMetaParseErrorTitle: "JSON 格式错误",
    sessionMetaParseErrorText: "当前内容无法解析为 JSON，请检查括号、引号和逗号。",
    confirmCdkey: "当前 CDKEY",
    confirmSession: "Session 状态",
    sessionNotChecked: "未验证",
    sessionReady: "已验证，可提交",
    notRequested: "尚未请求",
    checkLoading: "验证中...",
    activateLoading: "激活中...",
    needCdkeyForCheck: "请输入 CDKEY 后再执行验证。",
    needCdkeyForActivate: "请先输入 CDKEY。",
    needSessionInfo: "激活需要填写 session_info。",
    invalidSession: "session_info 不是合法 JSON，请检查后重试。",
    requestFailed: "无法连接接口，请稍后重试。",
    activateFailed: "激活失败，请稍后重试。",
    notFoundCdkey: "未检测到CDKEY",
    noTextResult: "未提取到可展示的文本结果。",
  },
  en: {
    pageTitle: "GPT Redeem Wizard",
    eyebrow: "Smart Redeem Workflow",
    brandTitle: "GPT Redeem Wizard",
    heroSubline: "Complete 4 steps in order to reduce mistakes and get live results.",
    step1NavTitle: "Verify Code",
    step1NavHint: "Check CDKEY availability first",
    step2NavTitle: "Login Account",
    step2NavHint: "Keep the target account online",
    step3NavTitle: "Validate Session",
    step3NavHint: "Paste and inspect session_info",
    step4NavTitle: "Confirm Redeem",
    step4NavHint: "Review everything before activate",
    step1Title: "Verify your CDKEY first",
    step1Chip: "Enter the code and run verification",
    step1Body: "After a successful verification, the wizard moves to the next step automatically.",
    step2Title: "Make sure the target account is signed in",
    step2Body: "Open ChatGPT in a new tab and confirm the target account is already signed in.",
    step3Title: "Paste and validate session_info",
    step3Body: "Open the AuthSession page, copy the full JSON, then validate the payload here.",
    step4Title: "Confirm before activation",
    step4Body: "Review the CDKEY and session status. Use force redeem only when needed.",
    openChatgpt: "Open ChatGPT",
    openAuthSession: "Open AuthSession",
    cdkeyLabel: "CDKEY",
    cdkeyPlaceholder: "Example: 5S8F-S888G-5G5G-55HH",
    checkButton: "Verify",
    sessionLabel: "session_info",
    sessionPlaceholder:
      '{"account":{"id":"user-xxx","planType":"free"},"accessToken":"ey...","user":{"email":"test@example.com"}}',
    forceRechargeLabel: "Force redeem and forfeit remaining membership time",
    activateButton: "Activate",
    helperTitle: "Current Step Guidance",
    helperStep1: "Enter the CDKEY and verify it before moving on.",
    helperStep2: "No data is submitted here. Just confirm the target account is already logged in.",
    helperStep3: "Paste the full session_info JSON and validate its structure locally first.",
    helperStep4: "Review the current CDKEY and session status, then send the activation request.",
    checkResultTitle: "Verification Result",
    activateResultTitle: "Activation Result",
    step1ResultTag: "Step 1",
    step4ResultTag: "Step 4",
    nextStep: "Next",
    backStep: "Back",
    loggedInNext: "Logged in, continue",
    validateSessionButton: "Validate Session",
    sessionMetaIdleTitle: "Session not checked",
    sessionMetaIdleText: "Paste the full JSON and validate it below.",
    sessionMetaValidTitle: "Session looks valid",
    sessionMetaValidText: "Account data and accessToken were detected. You can continue.",
    sessionMetaInvalidTitle: "Session validation failed",
    sessionMetaInvalidText: "Missing account, user, or accessToken. Copy the full JSON again.",
    sessionMetaParseErrorTitle: "Invalid JSON",
    sessionMetaParseErrorText: "The current content cannot be parsed as JSON.",
    confirmCdkey: "Current CDKEY",
    confirmSession: "Session Status",
    sessionNotChecked: "Not validated",
    sessionReady: "Validated and ready",
    notRequested: "No request yet",
    checkLoading: "Verifying...",
    activateLoading: "Activating...",
    needCdkeyForCheck: "Enter the CDKEY before verification.",
    needCdkeyForActivate: "Enter the CDKEY first.",
    needSessionInfo: "session_info is required.",
    invalidSession: "session_info must be valid JSON.",
    requestFailed: "Unable to reach the API. Retry later.",
    activateFailed: "Activation failed. Retry later.",
    notFoundCdkey: "CDKEY not detected",
    noTextResult: "No displayable text result found.",
  },
};

const stepMeta = {
  1: { titleKey: "step1Title", chipKey: "step1Chip", helperKey: "helperStep1" },
  2: { titleKey: "step2Title", chipKey: "step2NavHint", helperKey: "helperStep2" },
  3: { titleKey: "step3Title", chipKey: "step3NavHint", helperKey: "helperStep3" },
  4: { titleKey: "step4Title", chipKey: "step4NavHint", helperKey: "helperStep4" },
};

const state = {
  currentStep: 1,
  cdkeyVerified: false,
  sessionVerified: false,
};

let currentLang = "zh";
let nodes;

const app = createShellApp(localeText, {
  onCheckComplete: handleCheckComplete,
  onActivateComplete: handleActivateComplete,
  onLanguageApplied: (lang) => {
    currentLang = lang;
    if (nodes) {
      updateStepUi();
      updateSessionMeta();
      updateConfirmation();
    }
  },
});

nodes = {
  panes: Array.from(document.querySelectorAll("[data-step-pane]")),
  progressSteps: Array.from(document.querySelectorAll(".progress-step")),
  helperCopy: document.getElementById("helper-copy"),
  stepTitle: document.getElementById("step-title"),
  stepChip: document.getElementById("step-chip"),
  stepKicker: document.getElementById("step-kicker"),
  afterCheckNext: document.querySelector('[data-role="after-check-next"]'),
  sessionValidateButton: document.getElementById("session-validate-button"),
  sessionNextButton: document.getElementById("session-next-button"),
  sessionMeta: document.getElementById("session-meta"),
  confirmCdkey: document.getElementById("confirm-cdkey"),
  confirmSession: document.getElementById("confirm-session"),
  cdkeyInput: document.getElementById("cdkey-input"),
  sessionInput: document.getElementById("session-info"),
};

bindWizardEvents();
updateStepUi();
updateSessionMeta();
updateConfirmation();

function bindWizardEvents() {
  document.querySelectorAll("[data-step-next]").forEach((button) => {
    button.addEventListener("click", () => {
      const sourceStep = Number(button.dataset.stepNext);
      if (!canAdvanceFrom(sourceStep)) return;
      goToStep(Math.min(4, sourceStep + 1));
    });
  });

  document.querySelectorAll("[data-step-prev]").forEach((button) => {
    button.addEventListener("click", () => {
      const sourceStep = Number(button.dataset.stepPrev);
      goToStep(Math.max(1, sourceStep - 1));
    });
  });

  nodes.progressSteps.forEach((button) => {
    button.addEventListener("click", () => {
      const target = Number(button.dataset.stepTarget);
      if (!canEnterStep(target)) return;
      goToStep(target);
    });
  });

  nodes.sessionValidateButton?.addEventListener("click", validateSessionLocally);
  nodes.cdkeyInput?.addEventListener("input", () => {
    state.cdkeyVerified = false;
    if (nodes.afterCheckNext) nodes.afterCheckNext.disabled = true;
    updateProgressStates();
    updateConfirmation();
  });
  nodes.sessionInput?.addEventListener("input", () => {
    state.sessionVerified = false;
    if (nodes.sessionNextButton) nodes.sessionNextButton.disabled = true;
    updateSessionMeta();
    updateProgressStates();
    updateConfirmation();
  });
}

function handleCheckComplete(summary) {
  state.cdkeyVerified = summary.success;
  if (nodes.afterCheckNext) nodes.afterCheckNext.disabled = !summary.success;
  updateProgressStates();
  updateConfirmation();
  if (summary.success) {
    goToStep(2);
  }
}

function handleActivateComplete(summary) {
  if (summary.success) {
    updateProgressStates();
  }
}

function validateSessionLocally() {
  const raw = nodes.sessionInput?.value.trim() || "";
  if (!raw) {
    state.sessionVerified = false;
    setSessionMeta("invalid", text("sessionMetaInvalidTitle"), text("needSessionInfo"));
    updateProgressStates();
    updateConfirmation();
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    state.sessionVerified = false;
    setSessionMeta("invalid", text("sessionMetaParseErrorTitle"), text("sessionMetaParseErrorText"));
    updateProgressStates();
    updateConfirmation();
    return;
  }

  const hasToken = typeof parsed?.accessToken === "string" && parsed.accessToken.trim();
  const hasAccount = typeof parsed?.account === "object" && parsed.account !== null;
  const hasUser = typeof parsed?.user === "object" && parsed.user !== null;

  if (hasToken && hasAccount && hasUser) {
    state.sessionVerified = true;
    setSessionMeta("valid", text("sessionMetaValidTitle"), text("sessionMetaValidText"));
    if (nodes.sessionNextButton) nodes.sessionNextButton.disabled = false;
    updateProgressStates();
    updateConfirmation();
    goToStep(4);
    return;
  }

  state.sessionVerified = false;
  if (nodes.sessionNextButton) nodes.sessionNextButton.disabled = true;
  setSessionMeta("invalid", text("sessionMetaInvalidTitle"), text("sessionMetaInvalidText"));
  updateProgressStates();
  updateConfirmation();
}

function setSessionMeta(mode, title, body) {
  if (!nodes.sessionMeta) return;
  nodes.sessionMeta.dataset.state = mode;
  nodes.sessionMeta.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span>`;
}

function updateSessionMeta() {
  if (state.sessionVerified) {
    setSessionMeta("valid", text("sessionMetaValidTitle"), text("sessionMetaValidText"));
    if (nodes.sessionNextButton) nodes.sessionNextButton.disabled = false;
    return;
  }

  setSessionMeta("idle", text("sessionMetaIdleTitle"), text("sessionMetaIdleText"));
  if (nodes.sessionNextButton) nodes.sessionNextButton.disabled = true;
}

function updateConfirmation() {
  if (nodes.confirmCdkey) {
    const value = nodes.cdkeyInput?.value.trim() || "-";
    nodes.confirmCdkey.textContent = value;
  }

  if (nodes.confirmSession) {
    nodes.confirmSession.textContent = state.sessionVerified
      ? text("sessionReady")
      : text("sessionNotChecked");
  }
}

function goToStep(step) {
  state.currentStep = step;
  updateStepUi();
}

function updateStepUi() {
  nodes.panes.forEach((pane) => {
    pane.classList.toggle("is-active", Number(pane.dataset.stepPane) === state.currentStep);
  });

  updateProgressStates();

  if (nodes.stepKicker) {
    nodes.stepKicker.textContent = `STEP ${state.currentStep}`;
  }
  if (nodes.stepTitle) {
    nodes.stepTitle.textContent = text(stepMeta[state.currentStep].titleKey);
  }
  if (nodes.stepChip) {
    nodes.stepChip.textContent = text(stepMeta[state.currentStep].chipKey);
  }
  if (nodes.helperCopy) {
    nodes.helperCopy.textContent = text(stepMeta[state.currentStep].helperKey);
  }
}

function updateProgressStates() {
  nodes.progressSteps.forEach((button) => {
    const step = Number(button.dataset.stepTarget);
    button.classList.toggle("is-active", step === state.currentStep);
    button.classList.toggle("is-complete", isStepComplete(step));
    button.disabled = !canEnterStep(step);
  });
}

function isStepComplete(step) {
  if (step === 1) return state.cdkeyVerified;
  if (step === 2) return state.cdkeyVerified && state.currentStep >= 3;
  if (step === 3) return state.sessionVerified;
  return false;
}

function canAdvanceFrom(step) {
  if (step === 1) return state.cdkeyVerified;
  if (step === 2) return state.cdkeyVerified;
  if (step === 3) return state.sessionVerified;
  return true;
}

function canEnterStep(step) {
  if (step <= 1) return true;
  if (step === 2) return state.cdkeyVerified || state.currentStep >= 2;
  if (step === 3) return state.cdkeyVerified || state.currentStep >= 3;
  if (step === 4) return state.sessionVerified || state.currentStep >= 4;
  return false;
}

function text(key) {
  return localeText[currentLang]?.[key] || localeText.zh[key] || "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
