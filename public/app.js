const shell = document.getElementById("shell");
const salonPanel = document.getElementById("salonPanel");
const salonResizeHandle = document.getElementById("salonResizeHandle");
const pixelTitleCanvas = document.getElementById("pixelTitleCanvas");
const chat = document.getElementById("chat");
const chatForm = document.getElementById("chatForm");
const promptInput = document.getElementById("prompt");
const sendButton = document.getElementById("sendButton");
const openConfig = document.getElementById("openConfig");
const closeConfig = document.getElementById("closeConfig");
const configPanel = document.getElementById("configPanel");
const configContent = document.querySelector("#configPanel .config-content");
const configForm = document.getElementById("configForm");
const configProvider = document.getElementById("configProvider");
const configModel = document.getElementById("configModel");
const configBaseURL = document.getElementById("configBaseURL");
const configApiKey = document.getElementById("configApiKey");
const configMeta = document.getElementById("configMeta");
const configStatus = document.getElementById("configStatus");
const saveConfigButton = document.getElementById("saveConfig");
let providerPresetButtons = [];
const openComputer = document.getElementById("openComputer");
const openTraining = document.getElementById("openTraining");
const styleSelector = document.getElementById("styleSelector");
const createStyle = document.getElementById("createStyle");
const openStylePanel = document.getElementById("openStylePanel");
const stylePanel = document.getElementById("stylePanel");
const closeStylePanel = document.getElementById("closeStylePanel");
const refreshStylePanelButton = document.getElementById("refreshStylePanel");
const stylePanelContent = document.getElementById("stylePanelContent");
const styleForm = document.getElementById("styleForm");
const styleNameInput = document.getElementById("styleNameInput");
const styleDescriptionInput = document.getElementById("styleDescriptionInput");
const stylePromptInput = document.getElementById("stylePromptInput");
const saveStyleButton = document.getElementById("saveStyleButton");
const stylePanelTitle = document.getElementById("stylePanelTitle");
const stylePanelKey = document.getElementById("stylePanelKey");
const styleEditorStatus = document.getElementById("styleEditorStatus");
const styleChatCount = document.getElementById("styleChatCount");
const styleMemoryCount = document.getElementById("styleMemoryCount");
const styleTrainingCount = document.getElementById("styleTrainingCount");
const styleUpdatedAt = document.getElementById("styleUpdatedAt");
const styleTrainedSummary = document.getElementById("styleTrainedSummary");
const styleMemorySummary = document.getElementById("styleMemorySummary");
const styleAgentSummary = document.getElementById("styleAgentSummary");
const openAdmin = document.getElementById("openAdmin");
const closeTraining = document.getElementById("closeTraining");
const trainingPanel = document.getElementById("trainingPanel");
const trainingJudgePrompt = document.getElementById("trainingJudgePrompt");
const trainingIterations = document.getElementById("trainingIterations");
const trainingConcurrency = document.getElementById("trainingConcurrency");
const trainingTargetScore = document.getElementById("trainingTargetScore");
const trainingTimeoutMs = document.getElementById("trainingTimeoutMs");
const saveTrainingPromptButton = document.getElementById("saveTrainingPrompt");
const startTrainingButton = document.getElementById("startTraining");
const trainingStatus = document.getElementById("trainingStatus");
const trainingCompleted = document.getElementById("trainingCompleted");
const trainingSuccessCount = document.getElementById("trainingSuccessCount");
const trainingTimeoutCount = document.getElementById("trainingTimeoutCount");
const trainingSuccessAvg = document.getElementById("trainingSuccessAvg");
const trainingRuns = document.getElementById("trainingRuns");
const trainingProgress = document.getElementById("trainingProgress");
const trainingPlaybook = document.getElementById("trainingPlaybook");
const adminPanel = document.getElementById("adminPanel");
const closeAdmin = document.getElementById("closeAdmin");
const adminStatus = document.getElementById("adminStatus");
const adminUsersCount = document.getElementById("adminUsersCount");
const adminAdminsCount = document.getElementById("adminAdminsCount");
const adminSessionsCount = document.getElementById("adminSessionsCount");
const adminStorageTotal = document.getElementById("adminStorageTotal");
const adminUsersList = document.getElementById("adminUsersList");
const adminMailMode = document.getElementById("adminMailMode");
const adminMailHost = document.getElementById("adminMailHost");
const adminMailPort = document.getElementById("adminMailPort");
const adminMailSecure = document.getElementById("adminMailSecure");
const adminMailUser = document.getElementById("adminMailUser");
const adminMailPass = document.getElementById("adminMailPass");
const adminMailFrom = document.getElementById("adminMailFrom");
const adminMailTestTo = document.getElementById("adminMailTestTo");
const adminSaveMailConfig = document.getElementById("adminSaveMailConfig");
const adminSendMailTest = document.getElementById("adminSendMailTest");
const adminMailStatus = document.getElementById("adminMailStatus");
const adminRefreshDatabase = document.getElementById("adminRefreshDatabase");
const adminBackupDatabase = document.getElementById("adminBackupDatabase");
const adminDatabaseStatus = document.getElementById("adminDatabaseStatus");
const adminDatabaseHealth = document.getElementById("adminDatabaseHealth");
const toggleSources = document.getElementById("toggleSources");
const closeSources = document.getElementById("closeSources");
const sourcesPanel = document.getElementById("sourcesPanel");
const sourcesContent = document.getElementById("sourcesContent");
const filePicker = document.getElementById("filePicker");
const addFilesButton = document.getElementById("addFilesButton");
const pendingAttachments = document.getElementById("pendingAttachments");
const attachmentHint = document.getElementById("attachmentHint");
const authGate = document.getElementById("authGate");
const authCopy = document.getElementById("authCopy");
const authStatus = document.getElementById("authStatus");
const showLoginTab = document.getElementById("showLoginTab");
const showRegisterTab = document.getElementById("showRegisterTab");
const showResetTab = document.getElementById("showResetTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const resetForm = document.getElementById("resetForm");
const loginIdentity = document.getElementById("loginIdentity");
const loginPassword = document.getElementById("loginPassword");
const loginTwoFactorField = document.getElementById("loginTwoFactorField");
const loginTwoFactorCode = document.getElementById("loginTwoFactorCode");
const loginSubmitButton = document.getElementById("loginSubmit");
const registerAccount = document.getElementById("registerAccount");
const registerEmail = document.getElementById("registerEmail");
const registerCode = document.getElementById("registerCode");
const registerPassword = document.getElementById("registerPassword");
const sendRegisterCodeButton = document.getElementById("sendRegisterCode");
const resetIdentity = document.getElementById("resetIdentity");
const resetCode = document.getElementById("resetCode");
const resetPassword = document.getElementById("resetPassword");
const sendResetCodeButton = document.getElementById("sendResetCode");
const sessionPill = document.getElementById("sessionPill");
const sessionIdentity = document.getElementById("sessionIdentity");
const logoutButton = document.getElementById("logoutButton");

const API_BASE_STORAGE_KEY = "hegel-salon-api-base";
const STORAGE_KEY = "hegel-salon-width";
const STYLE_STORAGE_KEY = "hegel-salon-style";
const DEFAULT_SALON_WIDTH = 860;
const MIN_SALON_WIDTH = 620;
const MAX_SALON_WIDTH = 1120;
const PIXEL_TITLE = "与黑格尔对话";
const PIXEL_FONT = '"ArkPixel16", monospace';
const MESSAGE_FONT = '400 17px "Noto Sans SC"';
const AUTO_SCROLL_EDGE = 88;
const SUPPORTED_HINT = "支持图片、PDF、Excel、CSV、TSV、TXT、JSON";

const UI_COPY = {
  assistantRole: "黑格尔",
  userRole: "你",
  initialAssistant: "把问题交给我。我不替你省略概念的劳动。",
  loadingAssistant: "我正在把这个问题连同附件一起放回概念与材料之中。",
  chatErrorPrefix: "当前无法回答：",
  emptyReply: "当前没有返回文本。",
  unknownError: "未知错误",
  noKey: "未填写",
  activeModel: "当前生效模型",
  activeBaseUrl: "当前生效中转站",
  projectKey: "当前项目 Key",
  unknown: "未知",
  unset: "未设置",
  configSavedHint: "保存后，下一次提问立即生效。",
  savingConfig: "正在保存配置…",
  saveConfigFailed: "API 配置保存失败",
  loadConfigFailed: "API 配置加载失败",
  loadSourcesFailed: "加载失败：",
  savedConfigSuccess: "已保存。下一次提问将使用新的配置。",
  portraitDeck:
    "这里不是摘要堆叠，而是一间黑色阅读室。你把问题交进来，我只从当前版本线、原典原句与概念运动里回答。",
  salonIntro:
    "中文问题优先走中文版本线。现在也可以把图片、PDF、Excel 一起交给我读。",
  promptLabel: "在这里发问",
  promptPlaceholder:
    "例如：概括这份 PDF 的论点；比较这张图和黑格尔文本；或读取这份 Excel 再回答。",
  composerHint:
    "默认中文。若你附上图片、PDF 或 Excel，我会把它们和当前问题一起送进理解链路。",
  send: "发问",
  openConfig: "API 配置",
  sources: "查看原典与依据",
  close: "关闭",
  portraitAlt: "黑格尔半身像",
  resizeLabel: "拖动调整聊天区宽度",
  configDefaultStatus:
    "当前页面会优先使用项目目录里的 config/api.json。",
  loadingSources: "正在加载原典语料与蒸馏材料…",
  addFiles: "添加附件",
  attachmentHint: SUPPORTED_HINT,
  pendingAttachmentTitle: "待发送附件",
  attachmentOnlyPrompt: "请先输入问题或直接带附件发送。"
};

UI_COPY.portraitDeck =
  "Das Bekannte überhaupt ist darum, weil es bekannt ist, nicht erkannt.";

UI_COPY.portraitDeck =
  "Das Bekannte \u00fcberhaupt ist darum,\nweil es bekannt ist, nicht erkannt.";

function createInitialMessageRecord() {
  return {
    role: "assistant",
    content: UI_COPY.initialAssistant,
    attachments: []
  };
}

function normalizeApiBaseUrlInput(rawBaseURL = "", provider = "") {
  const raw = String(rawBaseURL || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    let pathname = String(url.pathname || "/").replace(/\/{2,}/g, "/");
    const providerKey = String(provider || "").trim().toLowerCase();

    if (providerKey === "openai" && (!pathname || pathname === "/")) {
      pathname = "/v1";
    }

    if (pathname.length > 1) {
      pathname = pathname.replace(/\/+$/, "");
    }

    url.pathname = pathname;
    return url.toString().replace(/\/+$/, pathname === "/" ? "/" : "");
  } catch {
    return raw.replace(/\/{2,}/g, "/");
  }
}

const messages = [createInitialMessageRecord()];

let pendingFiles = [];
let nextPendingFileId = 1;
let sourcesLoaded = false;
let configLoaded = false;
let trainingPollTimer = null;
let selectionDragActive = false;
let selectionPointerY = 0;
let selectionScrollFrame = null;
const trainingPromptState = {
  serverValue: "",
  dirty: false,
  focused: false
};
let authState = {
  authEnabled: false,
  httpsEnabled: false,
  user: null
};
let pendingAdminTwoFactorLogin = "";
let styleState = {
  currentStyleId: "",
  currentStyle: null,
  styles: []
};
let adminLoaded = false;
const scrollChromeControllers = [];

window.__hegelSalonApp = {
  authRequired: () => Boolean(authState.authEnabled && !authState.user),
  openAuthGate: () => {
    if (authGate) {
      authGate.classList.remove("hidden");
    }
  }
};

function readConfiguredApiBase() {
  const configured = String(
    window.HEGEL_SALON_API_BASE ||
      document.documentElement?.dataset?.apiBase ||
      ""
  ).trim();

  return /^https?:\/\//i.test(configured) ? configured.replace(/\/+$/, "") : "";
}

function getApiBase() {
  if (window.location.protocol !== "file:") {
    return "";
  }

  const configured = readConfiguredApiBase();
  if (configured) {
    return configured;
  }

  const stored = localStorage.getItem(API_BASE_STORAGE_KEY);
  if (stored && /^https?:\/\//i.test(stored)) {
    return stored.replace(/\/+$/, "");
  }

  return "";
}

function apiUrl(path) {
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}

function getCookieValue(name) {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separator = item.indexOf("=");
      return separator === -1
        ? null
        : {
            key: item.slice(0, separator).trim(),
            value: decodeURIComponent(item.slice(separator + 1).trim())
          };
    })
    .find((item) => item?.key === name)?.value || "";
}

function apiFetch(path, options = {}) {
  const csrfToken = getCookieValue("hegel_salon_csrf");
  const headers = new Headers(options.headers || {});
  if (csrfToken && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  return fetch(apiUrl(path), {
    credentials: "include",
    ...options,
    headers
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function roleLabelFor(role) {
  return role === "assistant" ? UI_COPY.assistantRole : UI_COPY.userRole;
}

function setText(selector, text) {
  const node = document.querySelector(selector);
  if (node) {
    node.textContent = text;
  }
}

function inferMediaType(name = "") {
  const lower = String(name || "").toLowerCase();
  const extensionMap = {
    ".csv": "text/csv",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".tsv": "text/tab-separated-values",
    ".txt": "text/plain",
    ".webp": "image/webp",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };

  const extension = Object.keys(extensionMap).find((key) => lower.endsWith(key));
  return extension ? extensionMap[extension] : "application/octet-stream";
}

function attachmentKindFrom(mediaType = "", name = "") {
  return String(mediaType || inferMediaType(name)).startsWith("image/") ? "image" : "file";
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 1024) {
    return value > 0 ? `${value} B` : "";
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function normalizeAttachmentRecord(record = {}) {
  const name = String(record.name || record.filename || "attachment").trim();
  const mediaType = String(record.mediaType || record.mimeType || "").trim() || inferMediaType(name);
  const fileId = String(record.fileId || record.file_id || "").trim() || null;
  const excerpt = normalizeWhitespace(record.excerpt || record.textExcerpt || "");
  const imageUrl = String(record.imageUrl || record.image_url || "").trim() || null;
  const size = Number(record.size);

  return {
    id: record.id || null,
    kind: record.kind === "image" || attachmentKindFrom(mediaType, name) === "image" ? "image" : "file",
    name,
    mediaType,
    size: Number.isFinite(size) && size >= 0 ? size : null,
    fileId,
    excerpt: excerpt || null,
    imageUrl
  };
}

function cloneMessageForRequest(message) {
  return {
    role: message.role,
    content: String(message.content || ""),
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map((attachment) => ({
          kind: attachment.kind,
          name: attachment.name,
          mediaType: attachment.mediaType,
          size: attachment.size,
          fileId: attachment.fileId || null,
          excerpt: attachment.excerpt || null,
          imageUrl: attachment.imageUrl || null
        }))
      : []
  };
}

function getShellMaxSalonWidth() {
  if (!shell) {
    return MAX_SALON_WIDTH;
  }

  const shellRect = shell.getBoundingClientRect();
  const portraitWidth =
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--portrait-width")
    ) || 470;

  return clamp(shellRect.width - portraitWidth - 32, MIN_SALON_WIDTH, MAX_SALON_WIDTH);
}

function hydrateStaticCopy() {
  document.title = "Hegel Salon";
  setText(".portrait-deck", UI_COPY.portraitDeck);
  setText(".salon-intro", UI_COPY.salonIntro);
  setText(".composer-label", UI_COPY.promptLabel);
  setText(".composer-hint", UI_COPY.composerHint);

  const portrait = document.querySelector(".portrait");
  if (portrait) {
    portrait.alt = UI_COPY.portraitAlt;
  }

  if (openConfig) {
    openConfig.textContent = UI_COPY.openConfig;
  }

  if (toggleSources) {
    toggleSources.textContent = UI_COPY.sources;
  }

  if (closeConfig) {
    closeConfig.textContent = UI_COPY.close;
  }

  if (closeSources) {
    closeSources.textContent = UI_COPY.close;
  }

  if (sendButton) {
    sendButton.textContent = UI_COPY.send;
  }

  if (promptInput) {
    promptInput.placeholder = UI_COPY.promptPlaceholder;
  }

  if (addFilesButton) {
    addFilesButton.textContent = UI_COPY.addFiles;
  }

  if (attachmentHint) {
    attachmentHint.textContent = UI_COPY.attachmentHint;
  }

  if (salonResizeHandle) {
    salonResizeHandle.setAttribute("aria-label", UI_COPY.resizeLabel);
  }

  if (configStatus) {
    configStatus.textContent = UI_COPY.configDefaultStatus;
  }

  if (sourcesContent && !sourcesLoaded) {
    sourcesContent.innerHTML = "";
    const loading = document.createElement("p");
    loading.className = "sources-loading";
    loading.textContent = UI_COPY.loadingSources;
    sourcesContent.append(loading);
  }
}

function setAuthStatus(message, kind = "neutral") {
  if (!authStatus) {
    return;
  }

  authStatus.textContent = message;
  authStatus.dataset.kind = kind;
}

function isAuthRequired() {
  return Boolean(authState.authEnabled && !authState.user);
}

function isAdminSession() {
  return authState.user?.role === "admin";
}

function hasAdminAccess() {
  return isAdminSession();
}

function getScopedStyleStorageKey() {
  return authState.user?.id ? `${STYLE_STORAGE_KEY}:${authState.user.id}` : STYLE_STORAGE_KEY;
}

function getCurrentStyleRecord() {
  if (!styleState.currentStyleId) {
    return null;
  }

  return styleState.styles.find((style) => style.id === styleState.currentStyleId) || null;
}

function setStyleEditorStatus(message, kind = "neutral") {
  if (!styleEditorStatus) {
    return;
  }

  styleEditorStatus.textContent = message;
  styleEditorStatus.dataset.kind = kind;
}

function buildStyleAgentSummary(style) {
  if (!style) {
    return "";
  }

  return [
    style.trainedStyleSummary ? `训练蒸馏摘要:\n${style.trainedStyleSummary}` : "",
    style.memoryProfile?.summaryText ? `Agent 记忆摘要:\n${style.memoryProfile.summaryText}` : "",
    style.description ? `风格说明:\n${style.description}` : "",
    style.userStylePrompt ? `用户风格 Prompt:\n${style.userStylePrompt}` : "",
  ].filter(Boolean).join("\n\n");
}

function renderStylePanel() {
  const style = styleState.currentStyle || getCurrentStyleRecord();
  const counts = style?.counts || {};
  const memoryProfile = style?.memoryProfile || null;

  if (stylePanelTitle) {
    stylePanelTitle.textContent = style?.name || "未选择风格";
  }

  if (stylePanelKey) {
    stylePanelKey.textContent = style?.styleKey || "-";
  }

  if (styleNameInput) {
    styleNameInput.value = style?.name || "";
    styleNameInput.disabled = !style;
  }

  if (styleDescriptionInput) {
    styleDescriptionInput.value = style?.description || "";
    styleDescriptionInput.disabled = !style;
  }

  if (stylePromptInput) {
    stylePromptInput.value = style?.userStylePrompt || "";
    stylePromptInput.disabled = !style;
  }

  if (saveStyleButton) {
    saveStyleButton.disabled = !style;
  }

  if (styleChatCount) {
    styleChatCount.textContent = String(counts.chatLogs || 0);
  }

  if (styleMemoryCount) {
    styleMemoryCount.textContent = String(counts.memoryTurns || 0);
  }

  if (styleTrainingCount) {
    styleTrainingCount.textContent = String(counts.trainingRuns || 0);
  }

  if (styleUpdatedAt) {
    styleUpdatedAt.textContent = style?.updatedAt ? formatDateTime(style.updatedAt) : "-";
  }

  if (styleTrainedSummary) {
    styleTrainedSummary.textContent = style?.trainedStyleSummary || "暂无训练蒸馏摘要。";
  }

  if (styleMemorySummary) {
    styleMemorySummary.textContent = memoryProfile?.summaryText || "暂无记忆摘要。";
  }

  if (styleAgentSummary) {
    styleAgentSummary.textContent = buildStyleAgentSummary(style) || "暂无 agent 摘要。";
  }

  if (!style) {
    setStyleEditorStatus("当前还没有可编辑的风格。", "error");
    return;
  }

  setStyleEditorStatus(
    memoryProfile?.updatedAt
      ? `当前风格已隔离加载，并以训练蒸馏结果为主。记忆摘要更新时间：${formatDateTime(memoryProfile.updatedAt)}`
      : "当前风格已隔离加载，并以训练蒸馏结果为主。该风格还没有生成持久记忆摘要。",
    "success"
  );
}

async function loadStyles() {
  if (!authState.user) {
    resetTrainingPromptState();
    styleState = { currentStyleId: "", currentStyle: null, styles: [] };
    if (styleSelector) {
      styleSelector.innerHTML = "";
      styleSelector.disabled = true;
    }
    if (createStyle) {
      createStyle.disabled = true;
    }
    renderStylePanel();
    return styleState;
  }

  const requested = localStorage.getItem(getScopedStyleStorageKey()) || "";
  const query = requested ? `?styleProfileId=${encodeURIComponent(requested)}` : "";
  const response = await apiFetch(`/api/styles${query}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "风格列表加载失败。");
  }

  styleState = {
    currentStyleId: data.currentStyleId || "",
    currentStyle: data.currentStyle || null,
    styles: Array.isArray(data.styles) ? data.styles : []
  };

  if (!styleState.currentStyle && styleState.currentStyleId) {
    styleState.currentStyle = getCurrentStyleRecord();
  }

  if (styleState.currentStyleId) {
    localStorage.setItem(getScopedStyleStorageKey(), styleState.currentStyleId);
  }

  if (styleSelector) {
    styleSelector.innerHTML = "";
    styleState.styles.forEach((style) => {
      const option = document.createElement("option");
      option.value = style.id;
      option.textContent = style.name || style.styleKey || style.id;
      styleSelector.append(option);
    });
    styleSelector.value = styleState.currentStyleId;
    styleSelector.disabled = styleState.styles.length === 0;
  }

  if (createStyle) {
    createStyle.disabled = false;
  }

  renderStylePanel();
  return styleState;
}

async function createStyleProfile() {
  const name = window.prompt("请输入风格名称");
  if (!name) {
    return;
  }

  const styleKey = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const response = await apiFetch("/api/styles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      name: name.trim(),
      styleKey: styleKey || `style-${Date.now()}`
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "新建风格失败。");
  }

  const created = data.style || null;
  await loadStyles();
  if (created?.id) {
    styleState.currentStyleId = created.id;
    styleState.currentStyle = styleState.styles.find((style) => style.id === created.id) || created;
    localStorage.setItem(getScopedStyleStorageKey(), created.id);
    if (styleSelector) {
      styleSelector.value = created.id;
    }
    renderStylePanel();
    await loadUserHistory();
    await loadTrainingStatus().catch(() => {});
    if (stylePanel) {
      stylePanel.classList.remove("hidden");
    }
    requestAnimationFrame(refreshScrollChrome);
  }
}

async function saveCurrentStyleProfile(event) {
  if (event) {
    event.preventDefault();
  }

  const currentStyle = styleState.currentStyle || getCurrentStyleRecord();
  if (!currentStyle) {
    setStyleEditorStatus("当前没有可保存的风格。", "error");
    return;
  }

  if (saveStyleButton) {
    saveStyleButton.disabled = true;
  }
  setStyleEditorStatus("正在保存当前风格…");

  try {
    const response = await apiFetch(`/api/styles/${encodeURIComponent(currentStyle.id)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        id: currentStyle.id,
        styleKey: currentStyle.styleKey,
        name: styleNameInput?.value.trim() || currentStyle.name,
        description: styleDescriptionInput?.value || "",
        userStylePrompt: stylePromptInput?.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "风格保存失败。");
    }

    await loadStyles();
    setStyleEditorStatus("当前风格已保存，训练摘要与记忆摘要仍按该风格独立生效。", "success");
  } catch (error) {
    setStyleEditorStatus(error instanceof Error ? error.message : "风格保存失败。", "error");
  } finally {
    if (saveStyleButton) {
      saveStyleButton.disabled = false;
    }
  }
}

async function selectStyleProfile(styleProfileId) {
  if (!styleProfileId || styleProfileId === styleState.currentStyleId) {
    return;
  }

  resetTrainingPromptState();
  styleState.currentStyleId = styleProfileId;
  styleState.currentStyle = styleState.styles.find((style) => style.id === styleProfileId) || null;
  localStorage.setItem(getScopedStyleStorageKey(), styleProfileId);
  if (styleSelector) {
    styleSelector.value = styleProfileId;
  }
  renderStylePanel();
  await loadUserHistory();
  await loadTrainingStatus().catch(() => {});
}

function showAuthTab(mode = "login") {
  const resetMode = mode === "reset";
  const registerMode = mode === "register";

  if (registerMode || resetMode) {
    setLoginTwoFactorMode(false);
  }

  if (showLoginTab) {
    showLoginTab.classList.toggle("is-active", !registerMode && !resetMode);
  }

  if (showRegisterTab) {
    showRegisterTab.classList.toggle("is-active", registerMode);
  }

  if (showResetTab) {
    showResetTab.classList.toggle("is-active", resetMode);
  }

  if (loginForm) {
    loginForm.classList.toggle("hidden", registerMode || resetMode);
  }

  if (registerForm) {
    registerForm.classList.toggle("hidden", !registerMode);
  }

  if (resetForm) {
    resetForm.classList.toggle("hidden", !resetMode);
  }
}

function setInteractionLocked(locked) {
  if (chatForm) {
    chatForm.classList.toggle("locked", locked);
  }

  if (promptInput) {
    promptInput.disabled = locked;
  }

  if (sendButton) {
    sendButton.disabled = locked;
  }

  if (addFilesButton) {
    addFilesButton.disabled = locked;
  }

  if (filePicker) {
    filePicker.disabled = locked;
  }

  if (openTraining) {
    openTraining.disabled = locked;
  }

  if (openComputer) {
    openComputer.disabled = locked;
  }
}

function promptForAuth(message = "Please sign in first.") {
  if (!authState.authEnabled) {
    return false;
  }

  if (authState.user) {
    return false;
  }

  if (authGate) {
    authGate.classList.remove("hidden");
  }

  if (pendingAdminTwoFactorLogin) {
    setAuthStatus("请先完成管理员 2FA 验证。", "error");
    showAuthTab("login");
    if (loginTwoFactorCode) {
      loginTwoFactorCode.focus();
    }
    return true;
  }

  setAuthStatus(message, "error");
  showAuthTab("login");
  if (loginIdentity) {
    loginIdentity.focus();
  }
  return true;
}

function setLoginTwoFactorMode(enabled, login = "") {
  pendingAdminTwoFactorLogin = enabled ? String(login || "").trim() : "";

  if (loginTwoFactorField) {
    loginTwoFactorField.classList.toggle("hidden", !enabled);
  }

  if (loginSubmitButton) {
    loginSubmitButton.textContent = enabled ? "Verify 2FA" : "Login";
  }

  if (!enabled && loginTwoFactorCode) {
    loginTwoFactorCode.value = "";
  }
}

function renderAuthState() {
  if (openConfig) {
    openConfig.classList.toggle("hidden", false);
  }

  if (openAdmin) {
    openAdmin.classList.toggle("hidden", !hasAdminAccess());
  }

  if (!authState.authEnabled) {
    if (authGate) {
      authGate.classList.add("hidden");
    }
    if (sessionPill) {
      sessionPill.classList.add("hidden");
    }
    adminLoaded = false;
    setInteractionLocked(false);
    window.__hegelSalonApp = {
      authRequired: () => false,
      openAuthGate: () => {}
    };
    return;
  }

  if (authCopy) {
    authCopy.textContent = authState.httpsEnabled
      ? "账号密码登录并完成邮箱验证后，才可进入会话、训练、上传与 computer use。"
      : "账号体系已开启。上线时请使用 HTTPS 以确保安全 cookie 与邮箱登录链路。";
  }

  if (authState.user) {
    setLoginTwoFactorMode(false);
    if (authGate) {
      authGate.classList.add("hidden");
    }
    if (sessionPill) {
      sessionPill.classList.remove("hidden");
    }
    if (sessionIdentity) {
      sessionIdentity.textContent = `${authState.user.account} · ${authState.user.email}`;
    }
    setAuthStatus("", "neutral");
    setInteractionLocked(false);
  } else {
    if (sessionPill) {
      sessionPill.classList.add("hidden");
    }
    if (authGate) {
      authGate.classList.remove("hidden");
    }
    closePanels();
    adminLoaded = false;
    setInteractionLocked(true);
    showAuthTab("login");
  }

  window.__hegelSalonApp = {
    authRequired: isAuthRequired,
    openAuthGate: () => promptForAuth()
  };
}

function handleAuthRequiredPayload(payload) {
  if (!payload?.authRequired) {
    return false;
  }

  authState.user = null;
  renderAuthState();
  return true;
}

async function loadUserHistory() {
  if (!authState.user) {
    replaceMessages([createInitialMessageRecord()]);
    return;
  }

  const response = await apiFetch(
    `/api/history${styleState.currentStyleId ? `?styleProfileId=${encodeURIComponent(styleState.currentStyleId)}` : ""}`
  );
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || "Failed to load user history.");
  }

  const history = Array.isArray(data.messages)
    ? data.messages
        .filter((message) => message?.role === "assistant" || message?.role === "user")
        .map((message) => ({
          role: message.role,
          content: String(message.content || ""),
          attachments: Array.isArray(message.attachments)
            ? message.attachments.map(normalizeAttachmentRecord)
            : [],
          loading: false
        }))
    : [];

  replaceMessages(history.length ? history : [createInitialMessageRecord()]);
}

async function loadAuthSession() {
  const response = await apiFetch("/api/auth/session");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load session.");
  }

  authState = {
    authEnabled: Boolean(data.authEnabled),
    httpsEnabled: Boolean(data.httpsEnabled),
    user: data.user || null
  };
  if (authState.user) {
    setLoginTwoFactorMode(false);
  }
  renderAuthState();
  if (authState.user) {
    await loadStyles();
    await loadUserHistory();
  } else {
    await loadStyles();
    replaceMessages([createInitialMessageRecord()]);
  }
  return authState;
}

async function sendRegisterCode() {
  if (!registerAccount || !registerEmail) {
    return;
  }

  const account = normalizeWhitespace(registerAccount.value || "");
  const email = normalizeWhitespace(registerEmail.value || "");
  if (!account || !email) {
    setAuthStatus("请先填写账号和邮箱。", "error");
    return;
  }

  sendRegisterCodeButton.disabled = true;
  setAuthStatus("正在发送邮箱验证码…");

  try {
    const response = await apiFetch("/api/auth/register/send-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        account: registerAccount.value || "",
        email: registerEmail.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "发送验证码失败。");
    }

    if (data.deliveryMode === "console") {
      if (registerCode && data.devCode) {
        registerCode.value = data.devCode;
      }
      setAuthStatus(
        data.devCode
          ? "当前未配置 SMTP，已自动填入开发验证码，可直接继续注册。"
          : "当前未配置 SMTP，这次没有真实发邮件。",
        "success"
      );
      if (registerPassword) {
        registerPassword.focus();
      }
      return;
    }

    if (data.deliveryMode === "console") {
      const devHint = data.devCode ? ` 开发验证码: ${data.devCode}` : "";
      setAuthStatus(
        `当前未配置 SMTP，这次没有真实发邮件。${devHint}`.trim(),
        "error"
      );
    } else {
      setAuthStatus("验证码已发送，请查收邮箱。", "success");
    }
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "发送验证码失败。", "error");
  } finally {
    sendRegisterCodeButton.disabled = false;
  }
}

async function sendResetCode() {
  if (!resetIdentity) {
    return;
  }

  const login = normalizeWhitespace(resetIdentity.value || "");
  if (!login) {
    setAuthStatus("请先填写账号或邮箱。", "error");
    return;
  }

  sendResetCodeButton.disabled = true;
  setAuthStatus("正在发送重置验证码…");

  try {
    const response = await apiFetch("/api/auth/password/send-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        login: resetIdentity.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "发送重置验证码失败。");
    }

    if (data.deliveryMode === "console") {
      if (resetCode && data.devCode) {
        resetCode.value = data.devCode;
      }
      setAuthStatus(
        data.devCode
          ? "当前未配置 SMTP，已自动填入开发验证码，可直接继续重置密码。"
          : "当前未配置 SMTP，这次没有真实发邮件。",
        "success"
      );
      if (resetPassword) {
        resetPassword.focus();
      }
      return;
    }

    if (data.deliveryMode === "console") {
      const devHint = data.devCode ? ` 开发验证码: ${data.devCode}` : "";
      setAuthStatus(
        `当前未配置 SMTP，这次没有真实发邮件。${devHint}`.trim(),
        "error"
      );
    } else {
      setAuthStatus("重置验证码已发送，请查收邮箱。", "success");
    }
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "发送重置验证码失败。", "error");
  } finally {
    sendResetCodeButton.disabled = false;
  }
}

async function submitRegister(event) {
  event.preventDefault();
  setAuthStatus("正在创建账号…");

  try {
    const response = await apiFetch("/api/auth/register/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        account: registerAccount?.value || "",
        email: registerEmail?.value || "",
        code: registerCode?.value || "",
        password: registerPassword?.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "注册失败。");
    }

    if (data.adminTwoFactorRequired) {
      setLoginTwoFactorMode(true, data.login || loginIdentity?.value || "");
      if (loginTwoFactorCode) {
        loginTwoFactorCode.value = data.devCode || "";
        loginTwoFactorCode.focus();
      }
      setAuthStatus(
        data.deliveryMode === "console"
          ? "管理员 2FA 验证码已生成，请输入验证码继续。"
          : "管理员 2FA 验证码已发送到邮箱，请输入验证码继续。",
        "success"
      );
      return;
    }

    if (data.adminTwoFactorRequired) {
      setLoginTwoFactorMode(true, data.login || loginIdentity?.value || "");
      if (loginTwoFactorCode) {
        loginTwoFactorCode.value = data.devCode || "";
        loginTwoFactorCode.focus();
      }
      setAuthStatus(
        data.deliveryMode === "console"
          ? "管理员 2FA 验证码已生成，请输入验证码继续。"
          : "管理员 2FA 验证码已发送到邮箱，请输入验证码继续。",
        "success"
      );
      return;
    }

    authState.user = data.user || null;
    renderAuthState();
    await loadStyles();
    await loadUserHistory();
    setAuthStatus("注册完成，已进入会话。", "success");
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "注册失败。", "error");
  }
}

async function submitLogin(event) {
  event.preventDefault();
  if (pendingAdminTwoFactorLogin) {
    await verifyAdminTwoFactor();
    return;
  }
  event.preventDefault();
  setAuthStatus("正在登录…");

  try {
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        login: loginIdentity?.value || "",
        password: loginPassword?.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "登录失败。");
    }

    authState.user = data.user || null;
    renderAuthState();
    await loadStyles();
    await loadUserHistory();
    setAuthStatus("登录成功。", "success");
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "登录失败。", "error");
  }
}

async function verifyAdminTwoFactor() {
  setAuthStatus("正在验证 2FA…");

  try {
    const response = await apiFetch("/api/auth/admin/verify-2fa", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        login: pendingAdminTwoFactorLogin || loginIdentity?.value || "",
        code: loginTwoFactorCode?.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "管理员 2FA 验证失败。");
    }

    authState.user = data.user || null;
    renderAuthState();
    await loadStyles();
    await loadUserHistory();
    setAuthStatus("登录成功。", "success");
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "管理员 2FA 验证失败。", "error");
  }
}

async function submitLoginWithTwoFactor(event) {
  event.preventDefault();

  if (pendingAdminTwoFactorLogin) {
    await verifyAdminTwoFactor();
    return;
  }

  setAuthStatus("正在登录…");

  try {
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        login: loginIdentity?.value || "",
        password: loginPassword?.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "登录失败。");
    }

    if (data.adminTwoFactorRequired) {
      setLoginTwoFactorMode(true, data.login || loginIdentity?.value || "");
      if (loginTwoFactorCode) {
        loginTwoFactorCode.value = data.devCode || "";
        loginTwoFactorCode.focus();
      }
      setAuthStatus(
        data.deliveryMode === "console"
          ? "管理员 2FA 验证码已生成，请输入验证码继续。"
          : "管理员 2FA 验证码已发送到邮箱，请输入验证码继续。",
        "success"
      );
      return;
    }

    authState.user = data.user || null;
    renderAuthState();
    await loadStyles();
    await loadUserHistory();
    setAuthStatus("登录成功。", "success");
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "登录失败。", "error");
  }
}

async function submitReset(event) {
  event.preventDefault();
  setAuthStatus("正在重置密码…");

  try {
    const response = await apiFetch("/api/auth/password/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        login: resetIdentity?.value || "",
        code: resetCode?.value || "",
        password: resetPassword?.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "密码重置失败。");
    }

    if (resetCode) {
      resetCode.value = "";
    }
    if (resetPassword) {
      resetPassword.value = "";
    }
    showAuthTab("login");
    setAuthStatus("密码已重置，请使用新密码登录。", "success");
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "密码重置失败。", "error");
  }
}

async function logoutSession() {
  try {
    await apiFetch("/api/auth/logout", {
      method: "POST"
    });
  } finally {
    setLoginTwoFactorMode(false);
    authState.user = null;
    await loadStyles();
    replaceMessages([createInitialMessageRecord()]);
    renderAuthState();
  }
}

function renderPixelTitle() {
  if (!pixelTitleCanvas || !pixelTitleCanvas.parentElement) {
    return;
  }

  const container = pixelTitleCanvas.parentElement;
  const targetWidth = Math.max(240, Math.floor(container.clientWidth));
  const baseFontSize = 16;
  const letterWidth = baseFontSize;
  const textWidth = PIXEL_TITLE.length * letterWidth;
  const scale = clamp(Math.floor(targetWidth / textWidth), 3, 6);
  const baseline = 18;
  const baseHeight = 22;

  pixelTitleCanvas.width = textWidth;
  pixelTitleCanvas.height = baseHeight;
  pixelTitleCanvas.style.width = `${textWidth * scale}px`;
  pixelTitleCanvas.style.height = `${baseHeight * scale}px`;

  const context = pixelTitleCanvas.getContext("2d");
  if (!context) {
    return;
  }

  context.clearRect(0, 0, pixelTitleCanvas.width, pixelTitleCanvas.height);
  context.fillStyle = "#f4efe5";
  context.textBaseline = "alphabetic";
  context.font = `${baseFontSize}px ${PIXEL_FONT}`;
  context.fillText(PIXEL_TITLE, 0, baseline);
}

async function ensurePixelFontAndRender() {
  if ("fonts" in document) {
    try {
      await document.fonts.load(`16px ${PIXEL_FONT}`);
      await document.fonts.load(MESSAGE_FONT);
    } catch {
      // Keep font loading resilient.
    }
  }

  renderPixelTitle();
}

function applySalonWidth(width) {
  const safeWidth = clamp(width, MIN_SALON_WIDTH, getShellMaxSalonWidth());
  document.documentElement.style.setProperty("--salon-width", `${safeWidth}px`);
  localStorage.setItem(STORAGE_KEY, String(safeWidth));
  renderPixelTitle();
}

function initializeSalonWidth() {
  if (!salonPanel) {
    return;
  }

  const saved = Number.parseFloat(localStorage.getItem(STORAGE_KEY) || "");
  applySalonWidth(Number.isFinite(saved) ? saved : DEFAULT_SALON_WIDTH);
}

function setupSalonResize() {
  if (!salonResizeHandle || !salonPanel) {
    return;
  }

  let startX = 0;
  let startWidth = 0;
  let dragging = false;

  function stopDrag() {
    dragging = false;
    salonResizeHandle.classList.remove("dragging");
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
  }

  function onPointerMove(event) {
    if (!dragging) {
      return;
    }

    const delta = event.clientX - startX;
    applySalonWidth(startWidth + delta);
  }

  salonResizeHandle.addEventListener("pointerdown", (event) => {
    dragging = true;
    startX = event.clientX;
    startWidth = salonPanel.getBoundingClientRect().width;
    salonResizeHandle.classList.add("dragging");
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
  });

  salonResizeHandle.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 48 : 24;
    const current = salonPanel.getBoundingClientRect().width;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applySalonWidth(current - step);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      applySalonWidth(current + step);
    }
  });

  window.addEventListener("resize", () => {
    applySalonWidth(salonPanel.getBoundingClientRect().width);
  });
}

function createAttachmentChip(attachment, { removable = false, onRemove } = {}) {
  const chip = document.createElement("div");
  chip.className = `attachment-chip ${attachment.kind || "file"}`;

  const name = document.createElement("span");
  name.className = "attachment-chip-name";

  const size = formatBytes(attachment.size);
  name.textContent = size ? `${attachment.name} · ${size}` : attachment.name;
  chip.append(name);

  if (removable) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "attachment-chip-remove";
    button.textContent = "×";
    button.addEventListener("click", () => onRemove?.(attachment));
    chip.append(button);
  }

  return chip;
}

function renderPendingAttachments() {
  if (!pendingAttachments) {
    return;
  }

  pendingAttachments.innerHTML = "";

  if (!pendingFiles.length) {
    pendingAttachments.classList.add("hidden");
    refreshScrollChrome();
    return;
  }

  pendingAttachments.classList.remove("hidden");

  const title = document.createElement("div");
  title.className = "pending-attachments-title";
  title.textContent = `${UI_COPY.pendingAttachmentTitle} · ${pendingFiles.length}`;
  pendingAttachments.append(title);

  const list = document.createElement("div");
  list.className = "pending-attachments-list";

  pendingFiles.forEach((attachment) => {
    list.append(
      createAttachmentChip(attachment, {
        removable: true,
        onRemove: () => {
          pendingFiles = pendingFiles.filter((item) => item.id !== attachment.id);
          renderPendingAttachments();
        }
      })
    );
  });

  pendingAttachments.append(list);
  refreshScrollChrome();
}

function addPendingFiles(fileList) {
  const next = [];

  Array.from(fileList || []).forEach((file) => {
    if (!file) {
      return;
    }

    const exists = pendingFiles.some(
      (item) =>
        item.name === file.name &&
        item.size === file.size &&
        item.mediaType === (file.type || inferMediaType(file.name))
    );

    if (exists) {
      return;
    }

    next.push({
      id: `pending-${nextPendingFileId++}`,
      file,
      name: file.name || "attachment",
      mediaType: file.type || inferMediaType(file.name),
      size: Number.isFinite(file.size) ? file.size : null,
      kind: attachmentKindFrom(file.type, file.name),
      fileId: null
    });
  });

  if (!next.length) {
    return;
  }

  pendingFiles = [...pendingFiles, ...next];
  renderPendingAttachments();
}

function syncPendingFilesFromPicker() {
  if (!filePicker?.files?.length) {
    return;
  }

  addPendingFiles(filePicker.files);
}

function schedulePendingFileSync(attempt = 0) {
  window.setTimeout(() => {
    syncPendingFilesFromPicker();
    if ((!filePicker?.files?.length || pendingFiles.length === 0) && attempt < 8) {
      schedulePendingFileSync(attempt + 1);
    }
  }, attempt === 0 ? 0 : 220);
}

function createMessageNode(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}${message.loading ? " loading" : ""}`;

  const roleNode = document.createElement("div");
  roleNode.className = "message-role";
  roleNode.textContent = roleLabelFor(message.role);

  article.append(roleNode);

  if (Array.isArray(message.attachments) && message.attachments.length) {
    const attachmentRow = document.createElement("div");
    attachmentRow.className = "message-attachments";

    message.attachments.forEach((attachment) => {
      attachmentRow.append(createAttachmentChip(attachment));
    });

    article.append(attachmentRow);
  }

  const bodyNode = document.createElement("div");
  bodyNode.className = "message-body";
  bodyNode.textContent = message.content;
  article.append(bodyNode);

  return article;
}

function scrollToBottom() {
  if (!chat) {
    return;
  }

  chat.scrollTop = chat.scrollHeight;
}

function renderMessages() {
  if (!chat) {
    return;
  }

  chat.innerHTML = "";
  messages.forEach((message) => {
    chat.append(createMessageNode(message));
  });

  scrollToBottom();
  refreshScrollChrome();
}

function replaceMessages(nextMessages = []) {
  messages.splice(0, messages.length, ...nextMessages);
  renderMessages();
}

function pushMessageRecord(message) {
  const nextMessage = {
    role: message.role,
    content: String(message.content || ""),
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map(normalizeAttachmentRecord)
      : [],
    loading: Boolean(message.loading)
  };

  messages.push(nextMessage);
  renderMessages();
  return nextMessage;
}

function removeLoadingMessage() {
  const index = messages.findIndex((message) => message.loading);
  if (index >= 0) {
    messages.splice(index, 1);
    renderMessages();
  }
}

function buildRequestPayload() {
  return {
    styleProfileId: styleState.currentStyleId || "",
    messages: messages
      .filter((message) => !message.loading)
      .map(cloneMessageForRequest)
  };
}

async function sendPrompt(prompt) {
  const question = normalizeWhitespace(prompt);
  if (promptForAuth("请先登录后再发问。")) {
    return;
  }

  if (!question && pendingFiles.length === 0) {
    return;
  }

  const pendingSnapshot = pendingFiles.map((item) => ({ ...item }));
  const userMessageIndex = messages.length;

  pushMessageRecord({
    role: "user",
    content: question,
    attachments: pendingSnapshot.map((item) => ({
      kind: item.kind,
      name: item.name,
      mediaType: item.mediaType,
      size: item.size,
      fileId: null
    }))
  });

  pushMessageRecord({
    role: "assistant",
    content: UI_COPY.loadingAssistant,
    attachments: [],
    loading: true
  });

  if (sendButton) {
    sendButton.disabled = true;
  }

  if (promptInput) {
    promptInput.disabled = true;
  }

  if (addFilesButton) {
    addFilesButton.disabled = true;
  }

  try {
    const payload = buildRequestPayload();
    let response;

    if (pendingSnapshot.length) {
      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      pendingSnapshot.forEach((item) => {
        formData.append("attachments", item.file, item.name);
      });

      response = await apiFetch("/api/chat", {
        method: "POST",
        body: formData
      });
    } else {
      response = await apiFetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(payload)
      });
    }

    const data = await response.json();
    removeLoadingMessage();

    if (!response.ok) {
      const errorMessage = data.error || UI_COPY.unknownError;
      if (data.authRequired) {
        authState.user = null;
        renderAuthState();
      }
      pushMessageRecord({
        role: "assistant",
        content: `${UI_COPY.chatErrorPrefix}${errorMessage}`,
        attachments: []
      });
      return;
    }

    if (data.userMessage) {
      messages[userMessageIndex] = {
        role: data.userMessage.role || "user",
        content: String(data.userMessage.content || ""),
        attachments: Array.isArray(data.userMessage.attachments)
          ? data.userMessage.attachments.map(normalizeAttachmentRecord)
          : [],
        loading: false
      };
    }

    pendingFiles = [];
    renderPendingAttachments();

    messages.push({
      role: "assistant",
      content: data.reply || UI_COPY.emptyReply,
      attachments: [],
      loading: false
    });
    renderMessages();
    if (authState.user && styleState.currentStyleId) {
      window.setTimeout(() => {
        loadStyles().catch(() => {});
      }, 1200);
    }
  } catch (error) {
    removeLoadingMessage();
    pushMessageRecord({
      role: "assistant",
      content: `${UI_COPY.chatErrorPrefix}${
        error instanceof Error ? error.message : UI_COPY.unknownError
      }`,
      attachments: []
    });
  } finally {
    if (sendButton) {
      sendButton.disabled = false;
    }

    if (promptInput) {
      promptInput.disabled = false;
      promptInput.focus();
    }

    if (addFilesButton) {
      addFilesButton.disabled = false;
    }
  }
}

function stopSelectionAutoScroll() {
  selectionDragActive = false;

  if (selectionScrollFrame !== null) {
    cancelAnimationFrame(selectionScrollFrame);
    selectionScrollFrame = null;
  }
}

function stepSelectionAutoScroll() {
  if (!selectionDragActive || !chat) {
    selectionScrollFrame = null;
    return;
  }

  const rect = chat.getBoundingClientRect();
  const threshold = Math.min(AUTO_SCROLL_EDGE, Math.max(48, rect.height * 0.18));
  let delta = 0;

  if (selectionPointerY < rect.top + threshold) {
    delta = -Math.ceil((rect.top + threshold - selectionPointerY) / 6);
  } else if (selectionPointerY > rect.bottom - threshold) {
    delta = Math.ceil((selectionPointerY - (rect.bottom - threshold)) / 6);
  }

  if (delta !== 0) {
    chat.scrollTop += delta;
  }

  selectionScrollFrame = requestAnimationFrame(stepSelectionAutoScroll);
}

function startSelectionAutoScroll(pointerY) {
  selectionDragActive = true;
  selectionPointerY = pointerY;

  if (selectionScrollFrame === null) {
    selectionScrollFrame = requestAnimationFrame(stepSelectionAutoScroll);
  }
}

function setupTextSelectionAutoScroll() {
  if (!chat) {
    return;
  }

  chat.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    if (!event.target.closest(".message-body, .message-role, .message-attachments")) {
      return;
    }

    startSelectionAutoScroll(event.clientY);
  });

  document.addEventListener("pointermove", (event) => {
    if (!selectionDragActive) {
      return;
    }

    if (event.buttons === 0) {
      stopSelectionAutoScroll();
      return;
    }

    selectionPointerY = event.clientY;
  });

  document.addEventListener("pointerup", stopSelectionAutoScroll);
  document.addEventListener("pointercancel", stopSelectionAutoScroll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopSelectionAutoScroll();
    }
  });
}

function createScrollChrome(host, className = "") {
  if (!host || host.dataset.scrollChromeAttached === "true") {
    return null;
  }

  const parent = host.parentElement;
  if (!parent) {
    return null;
  }

  const frame = document.createElement("div");
  frame.className = `scroll-frame ${className}`.trim();

  parent.insertBefore(frame, host);
  frame.append(host);

  host.classList.add("scroll-host");
  host.dataset.scrollChromeAttached = "true";

  const rail = document.createElement("div");
  rail.className = "scrollbar-rail";
  rail.innerHTML = '<div class="scrollbar-thumb" aria-hidden="true"></div>';
  frame.append(rail);

  const thumb = rail.firstElementChild;
  let dragging = false;
  let dragStartY = 0;
  let dragStartScrollTop = 0;

  function metrics() {
    const maxScroll = Math.max(0, host.scrollHeight - host.clientHeight);
    const trackHeight = rail.clientHeight;
    const thumbHeight = maxScroll
      ? clamp(Math.round((host.clientHeight / host.scrollHeight) * trackHeight), 52, trackHeight)
      : trackHeight;
    const travel = Math.max(0, trackHeight - thumbHeight);

    return {
      maxScroll,
      thumbHeight,
      travel
    };
  }

  function update() {
    const { maxScroll, thumbHeight, travel } = metrics();
    const thumbTop = maxScroll > 0 ? (host.scrollTop / maxScroll) * travel : 0;

    frame.classList.toggle("has-overflow", maxScroll > 0);
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${thumbTop}px)`;
  }

  function stopDrag() {
    if (!dragging) {
      return;
    }

    dragging = false;
    frame.classList.remove("dragging");
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stopDrag);
  }

  function onPointerMove(event) {
    if (!dragging) {
      return;
    }

    const { maxScroll, travel } = metrics();
    if (travel <= 0 || maxScroll <= 0) {
      return;
    }

    const delta = event.clientY - dragStartY;
    host.scrollTop = dragStartScrollTop + (delta / travel) * maxScroll;
  }

  function onMouseMove(event) {
    onPointerMove(event);
  }

  function beginDrag(clientY) {
    dragging = true;
    dragStartY = clientY;
    dragStartScrollTop = host.scrollTop;
    frame.classList.add("dragging");
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDrag);
  }

  thumb.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (typeof thumb.setPointerCapture === "function") {
      try {
        thumb.setPointerCapture(event.pointerId);
      } catch {
        // Ignore pointer capture failures and keep drag active.
      }
    }
    beginDrag(event.clientY);
  });

  thumb.addEventListener("mousedown", (event) => {
    event.preventDefault();
    beginDrag(event.clientY);
  });

  rail.addEventListener("pointerdown", (event) => {
    if (event.target === thumb) {
      return;
    }

    const { maxScroll, thumbHeight, travel } = metrics();
    if (travel <= 0 || maxScroll <= 0) {
      return;
    }

    const rect = rail.getBoundingClientRect();
    const offset = clamp(event.clientY - rect.top - thumbHeight / 2, 0, travel);
    host.scrollTop = (offset / travel) * maxScroll;
  });

  rail.addEventListener("mousedown", (event) => {
    if (event.target === thumb) {
      return;
    }

    const { maxScroll, thumbHeight, travel } = metrics();
    if (travel <= 0 || maxScroll <= 0) {
      return;
    }

    const rect = rail.getBoundingClientRect();
    const offset = clamp(event.clientY - rect.top - thumbHeight / 2, 0, travel);
    host.scrollTop = (offset / travel) * maxScroll;
  });

  host.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(host);
  const mutationObserver = new MutationObserver(update);
  mutationObserver.observe(host, { childList: true, subtree: true, characterData: true });

  update();
  return { update };
}

function setupScrollChrome() {
  [sourcesContent, configContent, stylePanelContent].filter(Boolean).forEach((host) => {
    const className = host === chat ? "scroll-frame-chat" : "scroll-frame-panel";
    const controller = createScrollChrome(host, className);
    if (controller) {
      scrollChromeControllers.push(controller);
    }
  });
}

function refreshScrollChrome() {
  scrollChromeControllers.forEach((controller) => controller.update());
}

function setAdminStatus(message, kind = "neutral") {
  if (!adminStatus) {
    return;
  }

  adminStatus.textContent = message;
  adminStatus.dataset.kind = kind;
}

function setAdminMailStatus(message, kind = "neutral") {
  if (!adminMailStatus) {
    return;
  }

  adminMailStatus.textContent = message;
  adminMailStatus.dataset.kind = kind;
}

function setAdminDatabaseStatus(message, kind = "neutral") {
  if (!adminDatabaseStatus) {
    return;
  }

  adminDatabaseStatus.textContent = message;
  adminDatabaseStatus.dataset.kind = kind;
}

function collectAdminMailConfigPayload() {
  return {
    mode: adminMailMode?.value || "console",
    host: adminMailHost?.value || "",
    port: Number(adminMailPort?.value || 587),
    secure: String(adminMailSecure?.value || "false") === "true",
    user: adminMailUser?.value || "",
    pass: adminMailPass?.value || "",
    from: adminMailFrom?.value || ""
  };
}

function renderAdminMailConfig(payload = {}) {
  const config = payload.config || {};

  if (adminMailMode) {
    adminMailMode.value = config.mode || "console";
  }
  if (adminMailHost) {
    adminMailHost.value = config.host || "";
  }
  if (adminMailPort) {
    adminMailPort.value = String(config.port || 587);
  }
  if (adminMailSecure) {
    adminMailSecure.value = String(Boolean(config.secure));
  }
  if (adminMailUser) {
    adminMailUser.value = config.user || "";
  }
  if (adminMailPass) {
    adminMailPass.value = config.pass || "";
  }
  if (adminMailFrom) {
    adminMailFrom.value = config.from || "";
  }

  setAdminMailStatus(
    payload.realMailEnabled
      ? "SMTP 已配置，可尝试发送测试邮件。"
      : "当前仍是 console 模式，不会真实发邮件。",
    payload.realMailEnabled ? "success" : "error"
  );
}

async function loadAdminMailConfig() {
  const response = await apiFetch("/api/admin/mail-config");
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || "SMTP 配置加载失败。");
  }

  renderAdminMailConfig(data);
  return data;
}

async function loadAdminDatabaseHealth() {
  const response = await apiFetch("/api/admin/database/health");
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || "数据库健康状态加载失败。");
  }

  if (adminDatabaseHealth) {
    adminDatabaseHealth.textContent = JSON.stringify(data, null, 2);
  }
  setAdminDatabaseStatus(
    data.integrity === "ok" ? "数据库健康检查通过。" : `数据库完整性结果：${data.integrity}`,
    data.integrity === "ok" ? "success" : "error"
  );
  return data;
}

async function createAdminDatabaseBackup() {
  setAdminDatabaseStatus("正在创建数据库备份…");

  const response = await apiFetch("/api/admin/database/backup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: "{}"
  });
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || "数据库备份失败。");
  }

  await loadAdminDatabaseHealth();
  setAdminDatabaseStatus(`数据库备份已生成：${data.backup.path}`, "success");
  return data;
}

async function saveAdminMailConfig() {
  setAdminMailStatus("正在保存 SMTP 配置…");

  const response = await apiFetch("/api/admin/mail-config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(collectAdminMailConfigPayload())
  });
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || "SMTP 配置保存失败。");
  }

  renderAdminMailConfig(data);
  setAdminMailStatus("SMTP 配置已保存。", "success");
  return data;
}

async function sendAdminMailTest() {
  setAdminMailStatus("正在发送测试邮件…");

  const response = await apiFetch("/api/admin/mail-test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      to: adminMailTestTo?.value || "",
      config: collectAdminMailConfigPayload()
    })
  });
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || "测试邮件发送失败。");
  }

  setAdminMailStatus(
    data.mode === "smtp"
      ? "测试邮件已交给 SMTP，请检查收件箱。"
      : "当前仍是 console 模式，没有真实发邮件。",
    data.mode === "smtp" ? "success" : "error"
  );
  return data;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("zh-CN", {
    hour12: false
  });
}

function createAdminMiniStat(label, value) {
  const stat = document.createElement("div");
  stat.className = "admin-mini-stat";

  const title = document.createElement("span");
  title.textContent = label;

  const strong = document.createElement("strong");
  strong.textContent = value;

  stat.append(title, strong);
  return stat;
}

async function runAdminUserAction(userId, action, body, pendingMessage, successMessage) {
  setAdminStatus(pendingMessage);

  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body || {})
  });
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || "后台操作失败。");
  }

  await loadAdminOverview(true);
  setAdminStatus(successMessage, "success");
  return data;
}

async function loadAdminUserData(userId) {
  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/data`);
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || "用户数据加载失败。");
  }

  return data;
}

function renderAdminOverview(payload = {}) {
  const summary = payload.summary || {};
  const users = Array.isArray(payload.users) ? payload.users : [];

  if (adminUsersCount) {
    adminUsersCount.textContent = String(summary.totalUsers || 0);
  }

  if (adminAdminsCount) {
    adminAdminsCount.textContent = String(summary.adminUsers || 0);
  }

  if (adminSessionsCount) {
    adminSessionsCount.textContent = String(summary.activeSessions || 0);
  }

  if (adminStorageTotal) {
    adminStorageTotal.textContent = formatBytes(summary.totalBytes || 0) || "0 B";
  }

  if (!adminUsersList) {
    return;
  }

  adminUsersList.innerHTML = "";

  if (!users.length) {
    const empty = document.createElement("div");
    empty.className = "admin-empty";
    empty.textContent = "暂无用户。";
    adminUsersList.append(empty);
    return;
  }

  users.forEach((user) => {
    const card = document.createElement("article");
    card.className = "admin-user-card";

    const head = document.createElement("div");
    head.className = "admin-user-head";

    const identity = document.createElement("div");
    const title = document.createElement("h4");
    title.className = "admin-user-title";
    title.textContent = user.account || user.email || user.id;

    const subtitle = document.createElement("p");
    subtitle.className = "admin-user-subtitle";
    subtitle.textContent = `${user.email || "-"} | 创建于 ${formatDateTime(user.createdAt)}`;

    identity.append(title, subtitle);

    const badge = document.createElement("div");
    badge.className = "admin-user-badge";
    badge.textContent = user.disabledAt
      ? "disabled"
      : user.role === "admin"
        ? "admin"
        : "user";

    head.append(identity, badge);

    const meta = document.createElement("div");
    meta.className = "admin-user-meta";
    meta.append(
      createAdminMiniStat("角色", user.role || "user"),
      createAdminMiniStat("会话", String(user.sessionCount || 0)),
      createAdminMiniStat("最近登录", formatDateTime(user.lastLoginAt)),
      createAdminMiniStat("最近活动", formatDateTime(user.lastSeenAt))
    );

    const storage = document.createElement("div");
    storage.className = "admin-user-storage";
    storage.append(
      createAdminMiniStat("总占用", formatBytes(user.storage?.totalBytes || 0) || "0 B"),
      createAdminMiniStat("数据库聊天", String(user.databaseData?.chatLogs || 0)),
      createAdminMiniStat("数据库记忆", String(user.databaseData?.memoryTurns || 0)),
      createAdminMiniStat("登录记录", String(user.databaseData?.loginEvents || 0)),
      createAdminMiniStat("训练记录", String(user.databaseData?.trainingRuns || 0)),
      createAdminMiniStat("使用天数", String(user.databaseData?.usageDays || 0)),
      createAdminMiniStat(
        "上传",
        `${user.storage?.uploads?.fileCount || 0} files / ${
          formatBytes(user.storage?.uploads?.totalBytes || 0) || "0 B"
        }`
      ),
      createAdminMiniStat(
        "运行态",
        `computer ${user.runtime?.computerStatus || "idle"} / optimizer ${
          user.runtime?.optimizerRunning ? "running" : "idle"
        }`
      )
    );

    const actions = document.createElement("div");
    actions.className = "admin-user-actions";

    const detail = document.createElement("div");
    detail.className = "admin-user-detail hidden";
    card.append(head, meta, storage, actions, detail);

    const inspectButton = document.createElement("button");
    inspectButton.className = "ghost-button";
    inspectButton.type = "button";
    inspectButton.textContent = "查看数据";
    inspectButton.addEventListener("click", async () => {
      try {
        setAdminStatus(`正在加载 ${user.account} 的数据库记录…`);
        const data = await loadAdminUserData(user.id);
        detail.innerHTML = "";
        const apiBlock = document.createElement("pre");
        apiBlock.textContent = JSON.stringify(
          {
            apiConfig: data.apiConfig,
            recentChats: data.recentChats,
            recentMemory: data.recentMemory
          },
          null,
          2
        );
        detail.append(apiBlock);
        detail.classList.toggle("hidden");
        setAdminStatus(`${user.account} 的数据库记录已加载。`, "success");
      } catch (error) {
        setAdminStatus(error instanceof Error ? error.message : "用户数据加载失败。", "error");
      }
    });

    const revokeButton = document.createElement("button");
    revokeButton.className = "ghost-button";
    revokeButton.type = "button";
    revokeButton.textContent = "撤销会话";
    revokeButton.addEventListener("click", async () => {
      try {
        await runAdminUserAction(
          user.id,
          "revoke-sessions",
          {},
          `正在撤销 ${user.account} 的会话…`,
          `已撤销 ${user.account} 的会话。`
        );
      } catch (error) {
        setAdminStatus(error instanceof Error ? error.message : "撤销会话失败。", "error");
      }
    });

    const clearButton = document.createElement("button");
    clearButton.className = "ghost-button";
    clearButton.type = "button";
    clearButton.textContent = "清空数据";
    clearButton.addEventListener("click", async () => {
      if (!window.confirm(`确定清空 ${user.account} 的运行数据吗？`)) {
        return;
      }

      try {
        await runAdminUserAction(
          user.id,
          "clear-data",
          {},
          `正在清空 ${user.account} 的数据…`,
          `已清空 ${user.account} 的运行数据。`
        );
      } catch (error) {
        setAdminStatus(error instanceof Error ? error.message : "清空数据失败。", "error");
      }
    });

    const toggleButton = document.createElement("button");
    toggleButton.className = "send-button";
    toggleButton.type = "button";
    toggleButton.textContent = user.disabledAt ? "启用用户" : "禁用用户";
    toggleButton.addEventListener("click", async () => {
      if (
        !window.confirm(
          user.disabledAt
            ? `确定启用 ${user.account} 吗？`
            : `确定禁用 ${user.account} 并撤销其会话吗？`
        )
      ) {
        return;
      }

      try {
        await runAdminUserAction(
          user.id,
          "set-disabled",
          { disabled: !Boolean(user.disabledAt) },
          user.disabledAt
            ? `正在启用 ${user.account}…`
            : `正在禁用 ${user.account}…`,
          user.disabledAt
            ? `${user.account} 已启用。`
            : `${user.account} 已禁用。`
        );
      } catch (error) {
        setAdminStatus(error instanceof Error ? error.message : "更新用户状态失败。", "error");
      }
    });

    actions.append(inspectButton, revokeButton, clearButton, toggleButton);
    adminUsersList.append(card);
  });
}

async function loadAdminOverview(force = false) {
  if (!isAdminSession()) {
    return null;
  }

  if (adminLoaded && !force) {
    return null;
  }

  const response = await apiFetch("/api/admin/overview");
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || "管理员后台加载失败。");
  }

  renderAdminOverview(data);
  await loadAdminMailConfig();
  await loadAdminDatabaseHealth();
  adminLoaded = true;
  setAdminStatus("管理员后台已加载。", "success");
  return data;
}

function closePanels() {
  if (sourcesPanel) {
    sourcesPanel.classList.add("hidden");
  }

  if (configPanel) {
    configPanel.classList.add("hidden");
  }

  if (trainingPanel) {
    trainingPanel.classList.add("hidden");
  }

  if (stylePanel) {
    stylePanel.classList.add("hidden");
  }

  if (adminPanel) {
    adminPanel.classList.add("hidden");
  }
}

function setConfigStatus(message, kind = "neutral") {
  if (!configStatus) {
    return;
  }

  configStatus.textContent = message;
  configStatus.dataset.kind = kind;
}

function applyProviderPreset({ provider = "", model = "", baseURL = "" } = {}) {
  if (configProvider) {
    configProvider.value = provider;
  }

  if (configModel && !normalizeWhitespace(configModel.value || "")) {
    configModel.value = model;
  } else if (configModel && model) {
    configModel.value = model;
  }

  if (configBaseURL) {
    configBaseURL.value = normalizeApiBaseUrlInput(baseURL, provider);
  }

  setConfigStatus("已填入推荐模板，确认 Key 后保存即可。", "success");
}

function initializeProviderGuide() {
  if (!configForm || document.getElementById("providerGuideShell")) {
    providerPresetButtons = Array.from(document.querySelectorAll("[data-provider-preset-index]"));
    return;
  }

  const guides = Array.isArray(window.HEGEL_PROVIDER_GUIDES)
    ? window.HEGEL_PROVIDER_GUIDES
        .map((guide) => ({
          name: String(guide?.name || "").trim(),
          tag: String(guide?.tag || "OpenAI Compatible").trim(),
          copy: String(guide?.copy || "").trim(),
          href: String(guide?.href || "").trim(),
          provider: String(guide?.provider || "openai").trim(),
          model: String(guide?.model || "").trim(),
          baseURL: String(guide?.baseURL || "").trim(),
          steps: Array.isArray(guide?.steps)
            ? guide.steps.map((step) => String(step || "").trim()).filter(Boolean)
            : []
        }))
        .filter((guide) => guide.name && guide.baseURL)
    : [];

  if (!guides.length) {
    providerPresetButtons = [];
    return;
  }

  const shell = document.createElement("section");
  shell.className = "provider-guide-shell";
  shell.id = "providerGuideShell";

  const head = document.createElement("div");
  head.className = "provider-guide-head";
  const headText = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Provider Guide";
  const title = document.createElement("h4");
  title.textContent = "常用中转与购买教程";
  headText.append(eyebrow, title);
  head.append(headText);

  const grid = document.createElement("div");
  grid.className = "provider-guide-grid";

  guides.forEach((guide, index) => {
    const card = document.createElement("article");
    card.className = "provider-guide-card";

    const cardHead = document.createElement("div");
    cardHead.className = "provider-guide-card-head";
    const name = document.createElement("strong");
    name.textContent = guide.name;
    const tag = document.createElement("span");
    tag.className = "provider-guide-tag";
    tag.textContent = guide.tag;
    cardHead.append(name, tag);

    const copy = document.createElement("p");
    copy.className = "provider-guide-copy";
    copy.textContent = guide.copy || "填写 OpenAI-compatible 的 Base URL、模型名与 API Key 后保存。";

    const links = document.createElement("div");
    links.className = "provider-guide-links";
    if (/^https?:\/\//i.test(guide.href)) {
      const link = document.createElement("a");
      link.href = guide.href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "官网入口";
      links.append(link);
    }

    const presetButton = document.createElement("button");
    presetButton.className = "ghost-button";
    presetButton.type = "button";
    presetButton.dataset.providerPresetIndex = String(index);
    presetButton.textContent = `填入 ${guide.name} 模板`;
    links.append(presetButton);

    const steps = document.createElement("ol");
    steps.className = "provider-guide-steps";
    const renderedSteps = guide.steps.length
      ? guide.steps
      : [
          "登录供应商站点并创建 API Key。",
          "确认余额或额度可用。",
          `本页填写 Provider=${guide.provider}、Base URL=${guide.baseURL}。`
        ];
    renderedSteps.forEach((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      steps.append(item);
    });

    card.append(cardHead, copy, links, steps);
    grid.append(card);
  });

  const note = document.createElement("div");
  note.className = "provider-guide-note";
  const noteStrong = document.createElement("strong");
  noteStrong.textContent = "使用提示：";
  const noteText = document.createTextNode(
    "如果返回网页 HTML 或出现 Unexpected token '<'，通常是 Base URL 路径不完整。"
  );
  note.append(noteStrong, noteText);
  shell.append(head, grid, note);

  if (configContent && configForm && configForm.parentElement === configContent) {
    configContent.insertBefore(shell, configForm);
  } else {
    configForm?.append(shell);
  }
  providerPresetButtons = Array.from(shell.querySelectorAll("[data-provider-preset-index]"));
}

function maskKey(key) {
  const value = String(key || "");
  if (!value) {
    return UI_COPY.noKey;
  }

  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function loadConfig() {
  const response = await apiFetch("/api/config");
  const data = await response.json();

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    throw new Error(data.error || UI_COPY.loadConfigFailed);
  }

  const projectConfig = data.projectConfig || {};
  const effectiveConfig = data.effectiveConfig || {};
  const normalizedProjectBaseURL = normalizeApiBaseUrlInput(
    projectConfig.baseURL || "",
    projectConfig.provider || effectiveConfig.provider || ""
  );
  const normalizedEffectiveBaseURL = normalizeApiBaseUrlInput(
    effectiveConfig.baseURL || "",
    effectiveConfig.provider || projectConfig.provider || ""
  );

  if (configProvider) {
    configProvider.value = projectConfig.provider || "";
  }

  if (configModel) {
    configModel.value = projectConfig.model || "";
  }

  if (configBaseURL) {
    configBaseURL.value = normalizedProjectBaseURL;
  }

  if (configApiKey) {
    configApiKey.value = projectConfig.apiKey || "";
  }

  const scopeLabel = authState.authEnabled ? "当前用户 Key" : UI_COPY.projectKey;

  if (configMeta) {
    configMeta.textContent = [
      `${UI_COPY.activeModel}：${effectiveConfig.model || UI_COPY.unknown}`,
      `${UI_COPY.activeBaseUrl}：${effectiveConfig.baseURL || UI_COPY.unset}`,
      `${UI_COPY.projectKey}：${maskKey(projectConfig.apiKey)}`
    ].join(" / ");
  }

  setConfigStatus(
    authState.authEnabled
      ? "保存后，当前登录用户会立刻使用这套 API 配置。"
      : UI_COPY.configSavedHint,
    "neutral"
  );
  if (authState.authEnabled) {
    if (configMeta) {
      configMeta.textContent = configMeta.textContent.replace(UI_COPY.projectKey, scopeLabel);
    }

    const ready = Boolean(projectConfig.model && projectConfig.baseURL && projectConfig.apiKey);
    setConfigStatus(
      ready
        ? "保存后，当前登录用户会立刻使用这套 API 配置。"
        : "当前登录用户尚未完整配置 API。未填写 model / baseURL / apiKey 前无法使用。",
      ready ? "neutral" : "error"
    );
  }

  configLoaded = true;
}

async function saveConfig(event) {
  event.preventDefault();

  if (saveConfigButton) {
    saveConfigButton.disabled = true;
  }

  setConfigStatus(UI_COPY.savingConfig, "neutral");

  try {
    const provider = configProvider?.value.trim() || "";
    const payload = {
      provider,
      model: configModel?.value.trim() || "",
      baseURL: normalizeApiBaseUrlInput(configBaseURL?.value || "", provider),
      apiKey: configApiKey?.value.trim() || ""
    };
    if (configBaseURL) {
      configBaseURL.value = payload.baseURL;
    }

    const response = await apiFetch("/api/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      handleAuthRequiredPayload(data);
      throw new Error(data.error || UI_COPY.saveConfigFailed);
    }

    configLoaded = false;
    await loadConfig();
    setConfigStatus(UI_COPY.savedConfigSuccess, "success");
  } catch (error) {
    setConfigStatus(
      error instanceof Error ? error.message : UI_COPY.saveConfigFailed,
      "error"
    );
  } finally {
    if (saveConfigButton) {
      saveConfigButton.disabled = false;
    }
  }
}

async function loadSources() {
  if (sourcesLoaded || !sourcesContent) {
    return;
  }

  const response = await apiFetch("/api/sources");
  const data = await response.json();
  sourcesContent.innerHTML = "";

  if (!response.ok) {
    handleAuthRequiredPayload(data);
    const error = document.createElement("p");
    error.className = "sources-loading";
    error.textContent = `${UI_COPY.loadSourcesFailed}${data.error || UI_COPY.unknownError}`;
    sourcesContent.append(error);
    refreshScrollChrome();
    return;
  }

  Object.entries(data).forEach(([name, content]) => {
    const block = document.createElement("section");
    block.className = "source-block";

    const title = document.createElement("h4");
    title.textContent = name;

    const pre = document.createElement("pre");
    pre.textContent = String(content || "");

    block.append(title, pre);
    sourcesContent.append(block);
  });

  sourcesLoaded = true;
  refreshScrollChrome();
}

function setTrainingStatus(message, kind = "neutral") {
  if (!trainingStatus) {
    return;
  }

  trainingStatus.textContent = message;
  trainingStatus.dataset.kind = kind;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTrainingPromptDraft() {
  return String(trainingJudgePrompt?.value || "");
}

function resetTrainingPromptState() {
  trainingPromptState.serverValue = "";
  trainingPromptState.dirty = false;
  trainingPromptState.focused = false;
}

function syncTrainingPromptDirtyState() {
  trainingPromptState.dirty = getTrainingPromptDraft() !== String(trainingPromptState.serverValue || "");
}

function applyTrainingPromptFromServer(prompt = "") {
  const nextPrompt = String(prompt || "");
  trainingPromptState.serverValue = nextPrompt;
  if (!trainingJudgePrompt) {
    return;
  }
  if (trainingPromptState.focused || trainingPromptState.dirty) {
    return;
  }
  trainingJudgePrompt.value = nextPrompt;
}

function formatTrainingScore(value) {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) {
    return "0";
  }
  return score % 1 === 0 ? String(score) : score.toFixed(1);
}

function renderTrainingProgressSummary(progress = {}) {
  const chips = [
    ["目标分", formatTrainingScore(progress.targetScore || 0)],
    ["完成进度", `${progress.completed || 0} / ${progress.iterationsTarget || 0}`],
    ["成功数", String(progress.successCount || 0)],
    ["超时数", String(progress.timeoutCount || 0)],
    ["平均分", formatTrainingScore(progress.averageScore || 0)],
    ["成功均分", formatTrainingScore(progress.successfulAverageScore || 0)]
  ];

  return `
    <div class="training-progress-summary">
      ${chips
        .map(
          ([label, value]) => `
            <article class="training-summary-chip">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTrainingRunsSummary(recentRuns = []) {
  if (!recentRuns.length) {
    return '<div class="training-empty">暂无训练记录。</div>';
  }

  return `
    <div class="training-run-list">
      ${recentRuns
        .map((run) => {
          const progress = run.progress || {};
          return `
            <article class="training-run-card">
              <div class="training-run-title">${escapeHtml(run.status || "unknown")} · ${escapeHtml(formatDateTime(run.startedAt))}</div>
              <div class="training-run-meta">
                <span>目标 ${escapeHtml(formatTrainingScore(run.targetScore || 0))}</span>
                <span>完成 ${escapeHtml(`${progress.completed || 0} / ${run.iterationsTarget || progress.iterationsTarget || 0}`)}</span>
                <span>均分 ${escapeHtml(formatTrainingScore(progress.averageScore || 0))}</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTrainingPlaybookSummary(playbook) {
  if (!playbook || typeof playbook !== "object") {
    return '<div class="training-empty">暂无优化 playbook。</div>';
  }

  const groups = [
    ["general", "全局规则"],
    ["concept", "概念问题"],
    ["audit", "形式逻辑"],
    ["historical", "历史/现实"]
  ].filter(([key]) => Array.isArray(playbook[key]) && playbook[key].length);

  if (!groups.length) {
    return '<div class="training-empty">暂无优化 playbook。</div>';
  }

  return `
    <div class="training-playbook-groups">
      ${groups
        .map(
          ([key, label]) => `
            <section class="training-playbook-group">
              <h5>${escapeHtml(label)}</h5>
              <ul>
                ${playbook[key]
                  .slice(0, 8)
                  .map((item) => `<li>${escapeHtml(item)}</li>`)
                  .join("")}
              </ul>
            </section>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTrainingStatus(payload = {}) {
  const progress = payload.progress || {};
  const running = Boolean(payload.running);
  const recentRuns = Array.isArray(payload.recentRuns) ? payload.recentRuns : [];
  if (payload.trainedStyleSummary && styleState.currentStyleId) {
    const target = styleState.styles.find((style) => style.id === styleState.currentStyleId);
    if (target) {
      target.trainedStyleSummary = payload.trainedStyleSummary;
    }
    if (styleState.currentStyle?.id === styleState.currentStyleId) {
      styleState.currentStyle = {
        ...(styleState.currentStyle || {}),
        trainedStyleSummary: payload.trainedStyleSummary
      };
    }
    renderStylePanel();
  }

  applyTrainingPromptFromServer(payload.judgePrompt || "");

  if (trainingCompleted) {
    trainingCompleted.textContent = `${progress.completed || 0} / ${progress.iterationsTarget || 0}`;
  }

  if (trainingSuccessCount) {
    trainingSuccessCount.textContent = String(progress.successCount || 0);
  }

  if (trainingTimeoutCount) {
    trainingTimeoutCount.textContent = String(progress.timeoutCount || 0);
  }

  if (trainingSuccessAvg) {
    trainingSuccessAvg.textContent = String(progress.successfulAverageScore || 0);
  }

  if (trainingProgress) {
    trainingProgress.innerHTML = renderTrainingProgressSummary(progress);
  }

  if (trainingRuns) {
    trainingRuns.innerHTML = renderTrainingRunsSummary(recentRuns);
  }

  if (trainingPlaybook) {
    trainingPlaybook.innerHTML = renderTrainingPlaybookSummary(payload.playbook);
  }

  setTrainingStatus(
    running
      ? `训练正在运行中，当前 ${progress.completed || 0} / ${progress.iterationsTarget || 0}。`
      : progress.done
        ? `训练已完成，成功均分 ${formatTrainingScore(progress.successfulAverageScore || 0)}。`
        : "训练当前未运行。",
    running ? "success" : "neutral"
  );
}

async function loadTrainingStatus() {
  const response = await apiFetch(
    `/api/training/status${styleState.currentStyleId ? `?styleProfileId=${encodeURIComponent(styleState.currentStyleId)}` : ""}`
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "训练状态加载失败");
  }

  renderTrainingStatus(data);
  return data;
}

async function persistTrainingPrompt({ quiet = false } = {}) {
  if (!trainingJudgePrompt || !styleState.currentStyleId) {
    return;
  }

  if (saveTrainingPromptButton) {
    saveTrainingPromptButton.disabled = true;
  }

  if (!quiet) {
    setTrainingStatus("正在保存训练 Prompt…");
  }

  const prompt = getTrainingPromptDraft();

  try {
    const response = await apiFetch("/api/training/prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        styleProfileId: styleState.currentStyleId || "",
        judgePrompt: prompt
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "训练 Prompt 保存失败");
    }
    trainingPromptState.serverValue = prompt;
    trainingPromptState.dirty = false;
    if (!quiet) {
      setTrainingStatus("训练 Prompt 已保存。", "success");
    }
    return data;
  } catch (error) {
    if (!quiet) {
      setTrainingStatus(error instanceof Error ? error.message : "训练 Prompt 保存失败", "error");
    }
    throw error;
  } finally {
    if (saveTrainingPromptButton) {
      saveTrainingPromptButton.disabled = false;
    }
  }
}

async function saveTrainingPrompt() {
  await persistTrainingPrompt();
}

async function startTraining() {
  if (startTrainingButton) {
    startTrainingButton.disabled = true;
  }

  setTrainingStatus("正在启动训练…");

  try {
    if (trainingPromptState.dirty) {
      await persistTrainingPrompt({ quiet: true });
    }

    const response = await apiFetch("/api/training/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        styleProfileId: styleState.currentStyleId || "",
        iterations: Number(trainingIterations?.value || 100000),
        concurrency: Number(trainingConcurrency?.value || 1),
        targetScore: Number(trainingTargetScore?.value || 9),
        timeoutMs: Number(trainingTimeoutMs?.value || 300000)
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "训练启动失败");
    }

    setTrainingStatus(`训练已启动，PID ${data.pid}。`, "success");
    await loadTrainingStatus();
    beginTrainingPolling();
  } catch (error) {
    setTrainingStatus(error instanceof Error ? error.message : "训练启动失败", "error");
  } finally {
    if (startTrainingButton) {
      startTrainingButton.disabled = false;
    }
  }
}

function stopTrainingPolling() {
  if (trainingPollTimer) {
    clearInterval(trainingPollTimer);
    trainingPollTimer = null;
  }
}

function beginTrainingPolling() {
  stopTrainingPolling();
  trainingPollTimer = setInterval(() => {
    if (trainingPanel?.classList.contains("hidden")) {
      stopTrainingPolling();
      return;
    }

    loadTrainingStatus().catch((error) => {
      setTrainingStatus(
        error instanceof Error ? error.message : "训练状态刷新失败。",
        "error"
      );
    });
  }, 5000);
}

if (addFilesButton && filePicker) {
  addFilesButton.addEventListener("click", () => {
    schedulePendingFileSync();
    if (typeof filePicker.showPicker === "function") {
      filePicker.showPicker().catch(() => {
        filePicker.click();
      });
      return;
    }
    filePicker.click();
  });

  filePicker.addEventListener("change", (event) => {
    addPendingFiles(event.target.files);
    filePicker.value = "";
  });

  filePicker.addEventListener("input", () => {
    syncPendingFilesFromPicker();
  });

  window.addEventListener("focus", () => {
    schedulePendingFileSync();
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = normalizeWhitespace(promptInput?.value || "");

    if (!prompt && pendingFiles.length === 0) {
      return;
    }

    if (promptInput) {
      promptInput.value = "";
    }

    await sendPrompt(prompt);
  });
}

if (openConfig) {
  openConfig.addEventListener("click", async () => {
    if (promptForAuth("请先登录后再配置 API。")) {
      return;
    }

    if (sourcesPanel) {
      sourcesPanel.classList.add("hidden");
    }

    if (adminPanel) {
      adminPanel.classList.add("hidden");
    }

    if (stylePanel) {
      stylePanel.classList.add("hidden");
    }

    if (configPanel) {
      configPanel.classList.remove("hidden");
    }

    requestAnimationFrame(refreshScrollChrome);

    if (!configLoaded) {
      try {
        await loadConfig();
      } catch (error) {
        setConfigStatus(
          error instanceof Error ? error.message : UI_COPY.loadConfigFailed,
          "error"
        );
      }
    }
  });
}

if (openTraining) {
  openTraining.addEventListener("click", async () => {
    if (promptForAuth("请先登录后再进入训练面板。")) {
      return;
    }

    if (sourcesPanel) {
      sourcesPanel.classList.add("hidden");
    }

    if (configPanel) {
      configPanel.classList.add("hidden");
    }

    if (adminPanel) {
      adminPanel.classList.add("hidden");
    }

    if (stylePanel) {
      stylePanel.classList.add("hidden");
    }

    if (trainingPanel) {
      trainingPanel.classList.remove("hidden");
    }

    requestAnimationFrame(refreshScrollChrome);

    try {
      await loadTrainingStatus();
      beginTrainingPolling();
    } catch (error) {
      setTrainingStatus(error instanceof Error ? error.message : "训练状态加载失败", "error");
    }
  });
}

if (openStylePanel) {
  openStylePanel.addEventListener("click", async () => {
    if (promptForAuth("请先登录后再查看风格面板。")) {
      return;
    }

    if (sourcesPanel) {
      sourcesPanel.classList.add("hidden");
    }

    if (configPanel) {
      configPanel.classList.add("hidden");
    }

    if (trainingPanel) {
      trainingPanel.classList.add("hidden");
    }

    if (adminPanel) {
      adminPanel.classList.add("hidden");
    }

    if (stylePanel) {
      stylePanel.classList.remove("hidden");
    }

    try {
      await loadStyles();
    } catch (error) {
      setStyleEditorStatus(error instanceof Error ? error.message : "风格面板加载失败。", "error");
    }

    requestAnimationFrame(refreshScrollChrome);
  });
}

if (openAdmin) {
  openAdmin.addEventListener("click", async () => {
    window.location.href = "./admin.html";
    return;
    if (!hasAdminAccess() && promptForAuth("请先登录后再进入后台。")) {
      return;
    }

    if (!hasAdminAccess()) {
      setAdminStatus("当前账号不是管理员。", "error");
      return;
    }

    if (sourcesPanel) {
      sourcesPanel.classList.add("hidden");
    }

    if (configPanel) {
      configPanel.classList.add("hidden");
    }

    if (trainingPanel) {
      trainingPanel.classList.add("hidden");
    }

    if (adminPanel) {
      adminPanel.classList.remove("hidden");
    }

    requestAnimationFrame(refreshScrollChrome);

    try {
      await loadAdminOverview();
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : "后台加载失败。", "error");
    }
  });
}

if (closeConfig) {
  closeConfig.addEventListener("click", () => {
    if (configPanel) {
      configPanel.classList.add("hidden");
    }
  });
}

if (closeStylePanel) {
  closeStylePanel.addEventListener("click", () => {
    if (stylePanel) {
      stylePanel.classList.add("hidden");
    }
  });
}

if (closeTraining) {
  closeTraining.addEventListener("click", () => {
    if (trainingPanel) {
      trainingPanel.classList.add("hidden");
    }
    stopTrainingPolling();
  });
}

if (closeAdmin) {
  closeAdmin.addEventListener("click", () => {
    if (adminPanel) {
      adminPanel.classList.add("hidden");
    }
  });
}

if (adminSaveMailConfig) {
  adminSaveMailConfig.addEventListener("click", async () => {
    try {
      await saveAdminMailConfig();
    } catch (error) {
      setAdminMailStatus(error instanceof Error ? error.message : "SMTP 配置保存失败。", "error");
    }
  });
}

if (adminSendMailTest) {
  adminSendMailTest.addEventListener("click", async () => {
    try {
      await sendAdminMailTest();
    } catch (error) {
      setAdminMailStatus(error instanceof Error ? error.message : "测试邮件发送失败。", "error");
    }
  });
}

if (adminRefreshDatabase) {
  adminRefreshDatabase.addEventListener("click", async () => {
    try {
      await loadAdminDatabaseHealth();
    } catch (error) {
      setAdminDatabaseStatus(error instanceof Error ? error.message : "数据库健康状态加载失败。", "error");
    }
  });
}

if (adminBackupDatabase) {
  adminBackupDatabase.addEventListener("click", async () => {
    try {
      await createAdminDatabaseBackup();
    } catch (error) {
      setAdminDatabaseStatus(error instanceof Error ? error.message : "数据库备份失败。", "error");
    }
  });
}

if (saveTrainingPromptButton) {
  saveTrainingPromptButton.addEventListener("click", saveTrainingPrompt);
}

if (startTrainingButton) {
  startTrainingButton.addEventListener("click", startTraining);
}

if (trainingJudgePrompt) {
  trainingJudgePrompt.addEventListener("focus", () => {
    trainingPromptState.focused = true;
  });
  trainingJudgePrompt.addEventListener("blur", () => {
    trainingPromptState.focused = false;
    syncTrainingPromptDirtyState();
  });
  trainingJudgePrompt.addEventListener("input", () => {
    syncTrainingPromptDirtyState();
  });
}

if (styleForm) {
  styleForm.addEventListener("submit", saveCurrentStyleProfile);
}

if (refreshStylePanelButton) {
  refreshStylePanelButton.addEventListener("click", async () => {
    try {
      await loadStyles();
      setStyleEditorStatus("风格面板已刷新。", "success");
    } catch (error) {
      setStyleEditorStatus(error instanceof Error ? error.message : "风格面板刷新失败。", "error");
    }
  });
}

if (showLoginTab) {
  showLoginTab.addEventListener("click", () => {
    showAuthTab("login");
  });
}

if (showRegisterTab) {
  showRegisterTab.addEventListener("click", () => {
    showAuthTab("register");
  });
}

if (showResetTab) {
  showResetTab.addEventListener("click", () => {
    showAuthTab("reset");
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", submitLoginWithTwoFactor);
}

if (registerForm) {
  registerForm.addEventListener("submit", submitRegister);
}

if (resetForm) {
  resetForm.addEventListener("submit", submitReset);
}

if (sendRegisterCodeButton) {
  sendRegisterCodeButton.addEventListener("click", sendRegisterCode);
}

if (sendResetCodeButton) {
  sendResetCodeButton.addEventListener("click", sendResetCode);
}

if (styleSelector) {
  styleSelector.addEventListener("change", async () => {
    try {
      await selectStyleProfile(styleSelector.value);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "风格切换失败。", "error");
    }
  });
}

if (createStyle) {
  createStyle.addEventListener("click", async () => {
    try {
      await createStyleProfile();
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "新建风格失败。", "error");
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", logoutSession);
}

initializeProviderGuide();

if (configBaseURL) {
  configBaseURL.addEventListener("blur", () => {
    configBaseURL.value = normalizeApiBaseUrlInput(
      configBaseURL.value,
      configProvider?.value || ""
    );
  });
}

if (configForm) {
  configForm.addEventListener("submit", saveConfig);
}

providerPresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const guides = Array.isArray(window.HEGEL_PROVIDER_GUIDES)
      ? window.HEGEL_PROVIDER_GUIDES
      : [];
    const index = Number(button.dataset.providerPresetIndex || -1);
    const guide = guides[index] || {};
    applyProviderPreset({
      provider: String(guide.provider || "openai"),
      model: String(guide.model || ""),
      baseURL: String(guide.baseURL || "")
    });
  });
});

if (toggleSources) {
  toggleSources.addEventListener("click", async () => {
    if (configPanel) {
      configPanel.classList.add("hidden");
    }

    if (adminPanel) {
      adminPanel.classList.add("hidden");
    }

    if (stylePanel) {
      stylePanel.classList.add("hidden");
    }

    if (sourcesPanel) {
      sourcesPanel.classList.remove("hidden");
    }

    await loadSources();
    requestAnimationFrame(refreshScrollChrome);
  });
}

if (closeSources) {
  closeSources.addEventListener("click", () => {
    if (sourcesPanel) {
      sourcesPanel.classList.add("hidden");
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePanels();
  }
});

window.addEventListener("resize", () => {
  renderPixelTitle();
  refreshScrollChrome();
});

window.__hegelSalonDebug = {
  addMessages(count = 60) {
    const sample =
      "这是用于聊天区调试的长消息。自由并不只是一句口号，而是意志在其对象中与自己相合。";

    for (let index = 0; index < count; index += 1) {
      pushMessageRecord({
        role: index % 2 === 0 ? "assistant" : "user",
        content: `${index + 1}. ${sample} `.repeat((index % 5) + 1).trim(),
        attachments: []
      });
    }
  },
  getState() {
    return {
      messageCount: messages.length,
      scrollTop: chat?.scrollTop || 0,
      scrollHeight: chat?.scrollHeight || 0,
      clientHeight: chat?.clientHeight || 0,
      pendingFiles: pendingFiles.length
    };
  }
};

hydrateStaticCopy();
renderMessages();
renderPendingAttachments();
initializeSalonWidth();
setupSalonResize();
setupTextSelectionAutoScroll();
setupScrollChrome();
refreshScrollChrome();
ensurePixelFontAndRender();
loadAuthSession().catch((error) => {
  setAuthStatus(
    error instanceof Error ? error.message : "Failed to load auth session.",
    "error"
  );
  if (authGate) {
    authGate.classList.remove("hidden");
  }
});
