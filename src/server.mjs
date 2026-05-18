import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import { loadCodexOpenAIConfig, loadCodexResponsesFallbackConfig } from "./codexConfig.mjs";
import { buildHegelStaticPromptBlocks } from "./hegelPrompt.mjs";
import { buildCorpusContext } from "./hegelContext.mjs";
import {
  buildAttachmentExtractionSummary,
  buildPromptBlock,
  compactConversationHistoryForPrompt,
  joinPromptBlocks,
  runQueryLoop
} from "./queryLoop.mjs";
import {
  dataDir,
  projectRoot,
  publicDir,
  researchDir,
  resolveDistillRoot
} from "./projectPaths.mjs";
import {
  listRegisteredTools,
  matchRegisteredTool
} from "./toolRegistry.mjs";
import {
  appendTextFileDurable,
  readJsonFileWithRecovery,
  writeJsonFileAtomic,
  writeTextFileAtomic
} from "./atomicFile.mjs";
import {
  stripInvalidDirectQuotes,
  validateReplyQuotes
} from "./hegelQuoteValidation.mjs";
import { auditHegelReply } from "./hegelSelfAudit.mjs";
import {
  appendOptimizerRecord,
  buildDistilledStyleSummaryFromPlaybook,
  buildOptimizerMemoryContext,
  readOptimizerJudgePrompt,
  readOptimizerPlaybook,
  writeOptimizerJudgePrompt
} from "./optimizerMemory.mjs";
import {
  beginAdminTwoFactorLogin,
  buildCsrfCookie,
  buildClearedSessionCookie,
  buildSessionCookie,
  completeRegistration,
  getAuthCookieName,
  getCsrfCookieName,
  getSessionFromRequest,
  isAdminUser,
  isAuthEnabled,
  listUsersForAdmin,
  loginUser,
  logoutRequest,
  recordSecurityAlert,
  recordSecurityAuditEvent,
  resetPasswordWithCode,
  revokeUserSessions,
  sendPasswordResetCode,
  sendRegistrationCode,
  setUserDisabled,
  verifyAdminTwoFactorLogin
} from "./auth.mjs";
import { buildRuntimeScope, ensureRuntimeScopeDirs } from "./runtimeScope.mjs";
import {
  isConsoleMailConfig,
  loadMailConfig,
  sendTestMail,
  writeMailConfig
} from "./mailDelivery.mjs";
import {
  appendUserChatLogToDb,
  appendChatSessionMessagesToDb,
  appendUserMemoryTurnToDb,
  clearUserBusinessDataInDb,
  countChatSessionMessagesInDb,
  countLoginEventsByUserIdFromDb,
  createUserDatabaseBackup,
  countUserChatLogsInDb,
  countUserMemoryTurnsInDb,
  countTrainingRunsByUserIdFromDb,
  countUsageRowsByUserIdFromDb,
  ensureDefaultStyleProfileForUser,
  claimNextLocalAgentTaskForDeviceInDb,
  finishLocalAgentTaskForDeviceInDb,
  getDefaultStyleProfileId,
  getUserDatabaseHealth,
  getUserDatabaseBackupDir,
  getUserDatabasePath,
  insertLocalAgentDeviceToDb,
  insertLocalAgentTaskToDb,
  insertStyleProfile,
  listAllChatSessionsForUserFromDb,
  listLocalAgentDevicesByUserIdFromDb,
  listLocalAgentTasksByUserIdFromDb,
  readAllUserChatLogsFromDb,
  readAllUserMemoryTurnsFromDb,
  readChatSessionByIdFromDb,
  readChatSessionMessagesFromDb,
  readLatestChatSessionFromDb,
  readLocalAgentDeviceByIdForUserFromDb,
  readLocalAgentDeviceByTokenHashFromDb,
  readLocalAgentTaskByIdForUserFromDb,
  readStyleProfileById,
  revokeLocalAgentDeviceForUserInDb,
  insertLoginEventToDb,
  insertTrainingRunToDb,
  listStyleProfilesByUserId,
  listRecentLoginEventsFromDb,
  listRecentSecurityAlertsFromDb,
  listRecentSecurityAuditEventsFromDb,
  listRecentTrainingRunsFromDb,
  listLoginEventsByUserIdFromDb,
  listSessionsByUserIdFromDb,
  listTrainingRunsByUserIdFromDb,
  readRecentUserChatLogsFromDb,
  readRecentUserMemoryTurnsFromDb,
  upsertChatSessionInDb,
  readGlobalUsageTimelineFromDb,
  readUserUsageSummaryFromDb,
  readUserApiConfigFromDb,
  readUserLongTermMemoryProfileFromDb,
  readUserMemoryProfileFromDb,
  recordUserUsageDailyToDb,
  stopOtherRunningTrainingRunsForUserInDb,
  updateStyleProfileById,
  updateLatestTrainingRunForUserInDb,
  writeUserLongTermMemoryProfileToDb,
  writeChatSessionMemoryProfileToDb,
  writeUserMemoryProfileToDb,
  writeUserApiConfigToDb
} from "./userDatabase.mjs";

const root = projectRoot;
const configDir = join(root, "config");
const computerWorkerScriptPath = join(root, "src", "browserComputerWorker.mjs");
const localAgentRunnerScriptPath = join(root, "scripts", "local_agent.mjs");
const port = Number(process.env.PORT || 3087);
const authEnabled = isAuthEnabled();
const localApiConfigPath = existsSync(join(configDir, "api.local.json"))
  ? join(configDir, "api.local.json")
  : join(configDir, "api.json");
const httpsKeyPath = String(process.env.HEGEL_TLS_KEY_PATH || "").trim();
const httpsCertPath = String(process.env.HEGEL_TLS_CERT_PATH || "").trim();
const httpsEnabled = Boolean(httpsKeyPath && httpsCertPath);
const publicBaseUrl = String(process.env.HEGEL_PUBLIC_BASE_URL || "").trim();
function readDurationEnv(name, fallbackMs, minimumMs, maximumMs) {
  const parsed = Number.parseInt(String(process.env[name] || ""), 10);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
  return Math.min(Math.max(value, minimumMs), maximumMs);
}
const publicChatFastMode = Boolean(publicBaseUrl) && process.env.HEGEL_PUBLIC_CHAT_FAST_MODE !== "0";
const publicChatTotalTimeoutMs = readDurationEnv(
  "HEGEL_PUBLIC_CHAT_TOTAL_TIMEOUT_MS",
  70000,
  5000,
  90000
);
const optimizerChatTotalTimeoutMs = readDurationEnv(
  "HEGEL_OPTIMIZER_CHAT_TOTAL_TIMEOUT_MS",
  240000,
  30000,
  900000
);
const upstreamChatTimeoutMs = readDurationEnv(
  "HEGEL_UPSTREAM_CHAT_TIMEOUT_MS",
  publicBaseUrl ? 55000 : 85000,
  5000,
  95000
);
const upstreamResponsesTimeoutMs = readDurationEnv(
  "HEGEL_UPSTREAM_RESPONSES_TIMEOUT_MS",
  publicBaseUrl ? 45000 : 80000,
  5000,
  95000
);
const explicitAllowedOrigins = new Set(
  String(process.env.HEGEL_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
const explicitAdminAllowedIps = new Set(
  String(process.env.HEGEL_ADMIN_ALLOWED_IPS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
const adminRemoteAllowed = process.env.HEGEL_ADMIN_REMOTE_ALLOWED === "1";
if (publicBaseUrl) {
  try {
    explicitAllowedOrigins.add(new URL(publicBaseUrl).origin);
  } catch {
    // Ignore malformed public base URL and fall back to request host origin.
  }
}
const persistAuthenticatedUserContent = process.env.HEGEL_PERSIST_USER_CONTENT !== "0";
const retainUploadedFiles = process.env.HEGEL_RETAIN_UPLOADS === "1";
const distillRoot = resolveDistillRoot();
const snapshotFiles = [
  "voice.md",
  "persona.md",
  "cadence.md",
  "style.md",
  "syntax.md",
  "trilingual.md",
  "translations-zh.md",
  "sources-zh.md",
  "sources.md"
];
const ADMIN_OVERVIEW_CACHE_MS = 10000;
const adminOverviewCache = {
  payload: null,
  updatedAt: 0
};
const sourcePanelEntries = [
  { name: "sources.md", path: join(distillRoot, "sources.md") },
  { name: "sources-zh.md", path: join(distillRoot, "sources-zh.md") },
  {
    name: "strict-source-audit-2026-04-12.md",
    path: join(researchDir, "strict-source-audit-2026-04-12.md")
  },
  {
    name: "corpus-gap-audit-2026-04-12-v2.md",
    path: join(researchDir, "corpus-gap-audit-2026-04-12-v2.md")
  },
  {
    name: "primary-runtime-audit-2026-04-13.md",
    path: join(researchDir, "primary-runtime-audit-2026-04-13.md")
  }
];

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const defaultProjectApiConfig = {
  provider: "",
  model: "",
  baseURL: "",
  apiKey: ""
};

const execFileAsync = promisify(execFile);
const rateLimitStore = new Map();
const BYTES_PER_MB = 1024 * 1024;
function readMbLimit(envName, fallbackMb, minimumMb) {
  const parsed = Number.parseInt(String(process.env[envName] || ""), 10);
  const resolved = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMb;
  return Math.max(minimumMb, resolved) * BYTES_PER_MB;
}

function isUnlimitedCountToken(value) {
  return /^(0|unlimited|none|inf|infinite)$/i.test(String(value || "").trim());
}

function readCountLimit(envName, fallbackValue, {
  minimum = 1,
  maximum = Number.POSITIVE_INFINITY,
  allowUnlimited = false
} = {}) {
  const raw = String(process.env[envName] || "").trim();
  const source = raw || fallbackValue;
  if (allowUnlimited && isUnlimitedCountToken(source)) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Number.parseInt(String(source || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    if (allowUnlimited && isUnlimitedCountToken(fallbackValue)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.min(Math.max(Number(fallbackValue || minimum), minimum), maximum);
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

const bundledPythonPath = join(
  homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  "python.exe"
);
const MAX_JSON_BODY_BYTES = readMbLimit("HEGEL_MAX_JSON_MB", 8, 1);
const MAX_MULTIPART_BODY_BYTES = readMbLimit("HEGEL_MAX_MULTIPART_MB", 48, 12);
const MAX_UPLOAD_FILE_COUNT = 6;
const MAX_UPLOAD_FILE_BYTES = readMbLimit("HEGEL_MAX_UPLOAD_FILE_MB", 40, 8);
const MAX_UPLOAD_TOTAL_BYTES = readMbLimit("HEGEL_MAX_UPLOAD_TOTAL_MB", 48, 16);
const NORMALIZED_HISTORY_LIMIT = readCountLimit("HEGEL_NORMALIZED_HISTORY_LIMIT", "unlimited", {
  allowUnlimited: true
});
const CHAT_MODEL_HISTORY_LIMIT = readCountLimit("HEGEL_CHAT_MODEL_HISTORY_LIMIT", "unlimited", {
  minimum: 24,
  maximum: 2048,
  allowUnlimited: true
});
const CHAT_STORAGE_HISTORY_LIMIT = readCountLimit("HEGEL_CHAT_STORAGE_HISTORY_LIMIT", "unlimited", {
  allowUnlimited: true
});
const HISTORY_DISPLAY_LIMIT = readCountLimit("HEGEL_HISTORY_DISPLAY_LIMIT", "unlimited", {
  allowUnlimited: true
});
const MEMORY_LAYER_CHAT_LIMIT = readCountLimit("HEGEL_MEMORY_LAYER_CHAT_LIMIT", "unlimited", {
  minimum: 32,
  maximum: 512,
  allowUnlimited: true
});
const MEMORY_LAYER_TURN_LIMIT = readCountLimit("HEGEL_MEMORY_LAYER_TURN_LIMIT", "unlimited", {
  minimum: 64,
  maximum: 1024,
  allowUnlimited: true
});
const MEMORY_HEURISTIC_CHAT_LIMIT = readCountLimit("HEGEL_MEMORY_HEURISTIC_CHAT_LIMIT", "unlimited", {
  minimum: 36,
  maximum: 1024,
  allowUnlimited: true
});
const MEMORY_HEURISTIC_TURN_LIMIT = readCountLimit("HEGEL_MEMORY_HEURISTIC_TURN_LIMIT", "unlimited", {
  minimum: 72,
  maximum: 2048,
  allowUnlimited: true
});
const PROMPT_RECENT_MESSAGE_LIMIT = readCountLimit("HEGEL_PROMPT_RECENT_MESSAGE_LIMIT", "unlimited", {
  minimum: 24,
  maximum: 256,
  allowUnlimited: true
});
const PROMPT_ATTACHMENT_RECENT_MESSAGE_LIMIT = readCountLimit("HEGEL_PROMPT_ATTACHMENT_RECENT_MESSAGE_LIMIT", "unlimited", {
  minimum: 16,
  maximum: 160,
  allowUnlimited: true
});
const PROMPT_RECENT_CHAR_BUDGET = readCountLimit("HEGEL_PROMPT_RECENT_CHAR_BUDGET", 90000, {
  minimum: 36000,
  maximum: 240000
});
const PROMPT_ATTACHMENT_RECENT_CHAR_BUDGET = readCountLimit("HEGEL_PROMPT_ATTACHMENT_RECENT_CHAR_BUDGET", 65000, {
  minimum: 30000,
  maximum: 180000
});
const PROMPT_MAX_MESSAGE_CHARS = readCountLimit("HEGEL_PROMPT_MAX_MESSAGE_CHARS", 12000, {
  minimum: 7000,
  maximum: 32000
});
const PROMPT_ATTACHMENT_MAX_MESSAGE_CHARS = readCountLimit("HEGEL_PROMPT_ATTACHMENT_MAX_MESSAGE_CHARS", 9000, {
  minimum: 5000,
  maximum: 24000
});
const PROMPT_SUMMARY_CHAR_BUDGET = readCountLimit("HEGEL_PROMPT_SUMMARY_CHAR_BUDGET", 12000, {
  minimum: 5200,
  maximum: 40000
});
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  ".csv",
  ".gif",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".pdf",
  ".png",
  ".tsv",
  ".txt",
  ".webp",
  ".xls",
  ".xlsx"
]);
const ALLOWED_ATTACHMENT_MEDIA_TYPES = new Set([
  "application/json",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/tab-separated-values"
]);
const DEFENDER_CANDIDATE_PATHS = [
  String(process.env.HEGEL_DEFENDER_SCAN_PATH || "").trim(),
  "C:\\Program Files\\Windows Defender\\MpCmdRun.exe",
  "C:\\Program Files\\Microsoft Defender\\MpCmdRun.exe"
].filter(Boolean);
const uploadScanMode = String(process.env.HEGEL_UPLOAD_SCAN_MODE || "best-effort")
  .trim()
  .toLowerCase();
const trustProxyHeaders = process.env.HEGEL_TRUST_PROXY === "1";

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLoopbackHost(hostname = "") {
  const normalized = String(hostname || "").trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function isLoopbackAddress(address = "") {
  const normalized = String(address || "").trim().toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("::ffff:127.")
  );
}

function canTrustForwardedHeaders(req) {
  return trustProxyHeaders || isLoopbackAddress(String(req?.socket?.remoteAddress || "").trim());
}

function getClientIp(req) {
  const forwardedFor = canTrustForwardedHeaders(req)
    ? String(req.headers["x-forwarded-for"] || "")
        .split(",")[0]
        .trim()
    : "";
  return forwardedFor || String(req.socket?.remoteAddress || "").trim();
}

function normalizeRateLimitIdentity(value, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase().slice(0, 256);
  return normalized || fallback;
}

function isBlankLoginIdentifier(value) {
  return !String(value || "").trim();
}

function isAllowedAdminIp(ipAddress = "") {
  const normalized = String(ipAddress || "").trim();
  return (
    adminRemoteAllowed ||
    isLoopbackAddress(normalized) ||
    explicitAdminAllowedIps.has(normalized)
  );
}

function getRequestProtocol(req) {
  const forwardedProto = canTrustForwardedHeaders(req)
    ? String(req.headers["x-forwarded-proto"] || "")
        .split(",")[0]
        .trim()
        .toLowerCase()
    : "";
  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }

  return req.socket?.encrypted ? "https" : "http";
}

function getRequestHost(req) {
  const forwardedHost = canTrustForwardedHeaders(req)
    ? String(req.headers["x-forwarded-host"] || "")
        .split(",")[0]
        .trim()
    : "";
  return String(forwardedHost || req.headers.host || `127.0.0.1:${port}`).trim();
}

function getRequestOrigin(req) {
  return `${getRequestProtocol(req)}://${getRequestHost(req)}`;
}

function getExpectedOrigin(req) {
  if (publicBaseUrl) {
    try {
      return new URL(publicBaseUrl).origin;
    } catch {
      // Ignore malformed configured base.
    }
  }

  return getRequestOrigin(req);
}

function maybeRedirectCanonicalHost(req, res, url) {
  if (!publicBaseUrl || !req.method) {
    return false;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return false;
  }

  if (url.pathname.startsWith("/api/")) {
    return false;
  }

  let canonical;
  try {
    canonical = new URL(publicBaseUrl);
  } catch {
    return false;
  }

  const canonicalHost = canonical.hostname.toLowerCase();
  if (!canonicalHost.startsWith("www.")) {
    return false;
  }

  const nakedHost = canonicalHost.slice(4);
  const requestHost = getRequestHost(req).split(":")[0].toLowerCase();
  if (requestHost !== nakedHost) {
    return false;
  }

  const redirectUrl = new URL(req.url || "/", canonical.origin);
  res.writeHead(308, {
    Location: redirectUrl.toString(),
    ...buildCorsHeaders(req),
    ...buildSecurityHeaders(req, { html: true })
  });
  res.end();
  return true;
}

function isAllowedOriginValue(req, origin) {
  const normalizedOrigin = String(origin || "").trim();
  if (!normalizedOrigin) {
    return false;
  }

  if (normalizedOrigin === "null") {
    try {
      const requestUrl = new URL(getRequestOrigin(req));
      return !authEnabled && isLoopbackHost(requestUrl.hostname);
    } catch {
      return false;
    }
  }

  try {
    const parsedOrigin = new URL(normalizedOrigin).origin;
    return (
      explicitAllowedOrigins.has(parsedOrigin) ||
      parsedOrigin === getExpectedOrigin(req) ||
      parsedOrigin === getRequestOrigin(req) ||
      (!authEnabled && isLoopbackHost(new URL(parsedOrigin).hostname))
    );
  } catch {
    return false;
  }
}

function buildSecurityHeaders(req, { html = false } = {}) {
  const pathname = (() => {
    try {
      return new URL(req.url || "/", `http://${getRequestHost(req)}`).pathname;
    } catch {
      return "/";
    }
  })();
  const headers = {
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, noarchive, nosnippet",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-DNS-Prefetch-Control": "off",
    "Origin-Agent-Cluster": "?1"
  };

  if (getRequestProtocol(req) === "https" || httpsEnabled) {
    headers["Strict-Transport-Security"] = "max-age=31536000";
  }

  if (html || pathname.startsWith("/api/")) {
    headers["Cache-Control"] = "no-store, max-age=0";
    headers.Pragma = "no-cache";
  }

  if (html) {
    headers["Content-Security-Policy"] = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self' data:",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self'"
    ].join("; ");
  }

  return headers;
}

function isSuspiciousUserAgent(req) {
  const userAgent = String(req.headers["user-agent"] || "").trim().toLowerCase();
  if (!userAgent) {
    return true;
  }

  return /curl|wget|python|aiohttp|scrapy|httpclient|postmanruntime|go-http-client|powershell|libwww-perl|okhttp|java\//i.test(
    userAgent
  );
}

function ensureNotSuspiciousClient(req, res) {
  if (isTrustedInternalRequest(req)) {
    return true;
  }

  if (!isSuspiciousUserAgent(req)) {
    return true;
  }

  sendJson(res, 403, {
    error: "Suspicious client blocked."
  });
  return false;
}

function resolveAllowedOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) {
    return "";
  }

  if (!isAllowedOriginValue(req, origin)) {
    return "";
  }

  if (origin === "null") {
    return "null";
  }

  return new URL(origin).origin;
}

function buildCorsHeaders(req) {
  const allowedOrigin = resolveAllowedOrigin(req);
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin"
  };

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    if (authEnabled) {
      headers["Access-Control-Allow-Credentials"] = "true";
    }
  } else if (!authEnabled && !req.headers.origin) {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return headers;
}

function issueCsrfCookieHeader(req) {
  const cookieName = getCsrfCookieName();
  const existing = readCookieValue(req.headers.cookie || "", cookieName);
  const token = existing || randomUUID().replace(/-/g, "");
  return buildCsrfCookie(token, req);
}

function isTrustedInternalRequest(req) {
  return (
    isLoopbackAddress(getClientIp(req)) &&
    !req.headers.origin &&
    !req.headers.referer &&
    !req.headers["sec-fetch-site"]
  );
}

function isLocalAgentBearerResultRequest(req) {
  if (String(req.method || "").toUpperCase() !== "POST") {
    return false;
  }

  const authorization = String(req.headers.authorization || "").trim();
  if (!/^Bearer\s+\S+/i.test(authorization)) {
    return false;
  }

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    return /^\/api\/local-agent\/tasks\/[^/]+\/result$/.test(url.pathname);
  } catch {
    return false;
  }
}

function ensureCsrfProtection(req, res) {
  if (["GET", "HEAD", "OPTIONS"].includes(String(req.method || "").toUpperCase())) {
    return true;
  }

  if (isTrustedInternalRequest(req)) {
    return true;
  }

  if (isLocalAgentBearerResultRequest(req)) {
    return true;
  }

  const fetchSite = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    sendJson(res, 403, { error: "Cross-site request blocked." });
    return false;
  }

  const origin = String(req.headers.origin || "").trim();
  const referer = String(req.headers.referer || "").trim();

  if (origin && !isAllowedOriginValue(req, origin)) {
    sendJson(res, 403, { error: "Origin validation failed." });
    return false;
  }

  if (!origin && referer) {
    try {
      if (!isAllowedOriginValue(req, new URL(referer).origin)) {
        sendJson(res, 403, { error: "Referer validation failed." });
        return false;
      }
    } catch {
      sendJson(res, 403, { error: "Referer validation failed." });
      return false;
    }
  }

  const csrfCookie = readCookieValue(req.headers.cookie || "", getCsrfCookieName());
  const csrfHeader = String(req.headers["x-csrf-token"] || "").trim();
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    sendJson(res, 403, { error: "CSRF validation failed." });
    return false;
  }

  return true;
}

function getRateLimitBucket(key, windowMs) {
  const now = Date.now();
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    const bucket = {
      count: 0,
      resetAt: now + windowMs
    };
    rateLimitStore.set(key, bucket);
    return bucket;
  }

  return current;
}

function checkRateLimit(req, res, scope, limit, windowMs) {
  const bucket = getRateLimitBucket(scope, windowMs);
  bucket.count += 1;

  if (bucket.count <= limit) {
    return true;
  }

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
  sendJson(
    res,
    429,
    {
      error: "Too many requests. Please try again later."
    },
    {
      "Retry-After": String(retryAfter)
    }
  );
  return false;
}

function handleBlankLoginIdentifier(req, res, loginIdentifier = "") {
  if (!isBlankLoginIdentifier(loginIdentifier)) {
    return false;
  }

  const ipAddress = getClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const route = req.url || "";
  const repeatedBlankLimitTriggered = !checkRateLimit(
    req,
    res,
    `login-empty-ip:${ipAddress}`,
    1,
    10 * 60 * 1000
  );

  if (repeatedBlankLimitTriggered) {
    recordSecurityAlert({
      alertType: "malformed_login_rate_limited",
      severity: "warning",
      loginIdentifier: null,
      ipAddress,
      userAgent,
      route,
      message: "Repeated empty login identifiers were rate limited.",
      details: {
        reason: "empty_login_identifier"
      }
    }).catch(() => {});
    return true;
  }

  try {
    insertLoginEventToDb({
      userId: null,
      loginIdentifier: "",
      ipAddress,
      userAgent,
      status: "failed",
      reason: "Login is required."
    });
  } catch {
    // Keep malformed-login handling resilient even if audit logging fails.
  }

  recordSecurityAuditEvent({
    eventType: "malformed_login_request",
    severity: "info",
    loginIdentifier: null,
    ipAddress,
    userAgent,
    route,
    details: {
      reason: "empty_login_identifier"
    }
  });

  sendJson(res, 400, {
    error: "Login is required."
  });
  return true;
}

function clearAdminOverviewCache() {
  adminOverviewCache.payload = null;
  adminOverviewCache.updatedAt = 0;
}

function recordUsage(context, usageKind, startedAtMs) {
  if (!context?.auth?.user?.id) {
    return;
  }

  try {
    recordUserUsageDailyToDb(
      context.auth.user.id,
      usageKind,
      new Date(startedAtMs || Date.now()).toISOString(),
      new Date().toISOString()
    );
  } catch {
    // Keep usage collection non-blocking.
  }
}

function sendJson(res, status, data, extraHeaders = {}) {
  const req = res.__hegelRequest || {
    headers: {},
    socket: {}
  };
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...buildCorsHeaders(req),
    ...buildSecurityHeaders(req),
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function withDeadline(promise, timeoutMs, message) {
  let timeoutId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function expectPlainObject(value, errorMessage = "Invalid JSON payload.") {
  if (!isPlainObject(value)) {
    throw new Error(errorMessage);
  }
  return value;
}

function sanitizeBoundedText(value, maxLength = 12000) {
  const normalized = normalizeWhitespace(value || "");
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function canonicalizeApiBaseURL(rawBaseURL = "", provider = "") {
  const raw = String(rawBaseURL || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    let pathname = String(url.pathname || "/").replace(/\/{2,}/g, "/");
    const providerKey = String(provider || "").trim().toLowerCase();
    const isOpenAiCompatible = providerKey === "openai";

    if (isOpenAiCompatible && (!pathname || pathname === "/")) {
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

function requireStringField(value, fieldName, { min = 0, max = 512, pattern = null, allowEmpty = true } = {}) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const normalized = value.trim();
  if (!allowEmpty && !normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  if (normalized.length < min) {
    throw new Error(`${fieldName} is too short.`);
  }

  if (normalized.length > max) {
    throw new Error(`${fieldName} is too long.`);
  }

  if (pattern && normalized && !pattern.test(normalized)) {
    throw new Error(`${fieldName} contains invalid characters.`);
  }

  return normalized;
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function requireUuid(value, fieldName = "id") {
  const normalized = String(value || "").trim();
  if (!isUuidLike(normalized)) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return normalized;
}

function validateApiConfigInput(input = {}) {
  const payload = expectPlainObject(input, "Invalid API config payload.");
  const provider = requireStringField(payload.provider ?? "", "provider", {
    max: 64,
    pattern: /^[a-zA-Z0-9._-]*$/,
    allowEmpty: true
  });

  return {
    provider,
    model: requireStringField(payload.model ?? "", "model", {
      max: 128,
      pattern: /^[a-zA-Z0-9._:/-]*$/,
      allowEmpty: true
    }),
    baseURL: (() => {
      const raw = requireStringField(payload.baseURL ?? payload.baseUrl ?? "", "baseURL", {
        max: 2048,
        allowEmpty: true
      });
      if (!raw) return "";
      let parsed;
      try {
        parsed = new URL(raw);
      } catch {
        throw new Error("baseURL must be a valid URL.");
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("baseURL must use http or https.");
      }
      return canonicalizeApiBaseURL(parsed.toString(), provider);
    })(),
    apiKey: requireStringField(payload.apiKey ?? "", "apiKey", {
      max: 4096,
      allowEmpty: true
    })
  };
}

function validateTrainingStartBody(input = {}) {
  const payload = expectPlainObject(input, "Invalid training payload.");
  const iterations = Number.parseInt(String(payload.iterations || "100000"), 10);
  const concurrency = Number.parseInt(String(payload.concurrency || "1"), 10);
  const targetScore = Number(payload.targetScore || 9);
  const timeoutMs = Number.parseInt(String(payload.timeoutMs || "300000"), 10);

  if (!Number.isFinite(iterations) || iterations < 1 || iterations > 100000) {
    throw new Error("iterations is invalid.");
  }
  if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("concurrency is invalid.");
  }
  if (!Number.isFinite(targetScore) || targetScore < 1 || targetScore > 10) {
    throw new Error("targetScore is invalid.");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 30000 || timeoutMs > 900000) {
    throw new Error("timeoutMs is invalid.");
  }

  return {
    styleProfileId: typeof payload.styleProfileId === "string" ? payload.styleProfileId.trim() : "",
    iterations,
    concurrency,
    targetScore,
    timeoutMs
  };
}

function validateTrainingPromptBody(input = {}) {
  const payload = expectPlainObject(input, "Invalid training prompt payload.");
  return {
    styleProfileId: typeof payload.styleProfileId === "string" ? payload.styleProfileId.trim() : "",
    judgePrompt: requireStringField(payload.judgePrompt ?? "", "judgePrompt", {
      max: 24000,
      allowEmpty: true
    })
  };
}

function validateComputerTaskBody(input = {}) {
  const payload = expectPlainObject(input, "Invalid browser task payload.");
  const task = requireStringField(payload.task ?? "", "task", {
    min: 1,
    max: 4000,
    allowEmpty: false
  });
  const startUrlRaw = requireStringField(payload.startUrl ?? "", "startUrl", {
    max: 2048,
    allowEmpty: true
  });

  let startUrl = "";
  if (startUrlRaw) {
    let parsed;
    try {
      parsed = new URL(startUrlRaw);
    } catch {
      throw new Error("startUrl must be a valid URL.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("startUrl must use http or https.");
    }
    startUrl = parsed.toString();
  }

  return {
    task,
    startUrl
  };
}

function validateAdminDisableBody(input = {}) {
  const payload = expectPlainObject(input, "Invalid admin payload.");
  return {
    disabled: payload.disabled === true
  };
}

function validateAdminClearDataBody(input = {}) {
  const payload = expectPlainObject(input, "Invalid clear-data payload.");
  const allowed = new Set(["logs", "uploads", "computer", "browser"]);
  const targets = Array.isArray(payload.targets)
    ? payload.targets
        .filter((item) => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => allowed.has(item))
    : [];

  return {
    targets
  };
}

function validateMailConfigBody(input = {}) {
  const payload = expectPlainObject(input, "Invalid mail config payload.");
  const mode = requireStringField(payload.mode ?? "console", "mode", {
    max: 16,
    pattern: /^(console|smtp)$/i,
    allowEmpty: false
  }).toLowerCase();
  const host = requireStringField(payload.host ?? "", "host", {
    max: 255,
    pattern: /^[a-zA-Z0-9._-]*$/,
    allowEmpty: mode !== "smtp"
  });
  const port = Number.parseInt(String(payload.port ?? 587), 10);
  const secure = payload.secure === true || String(payload.secure || "").trim().toLowerCase() === "true";
  const user = requireStringField(payload.user ?? "", "user", {
    max: 255,
    allowEmpty: mode !== "smtp"
  });
  const pass = requireStringField(payload.pass ?? "", "pass", {
    max: 512,
    allowEmpty: mode !== "smtp"
  });
  const from = requireStringField(payload.from ?? "", "from", {
    max: 255,
    allowEmpty: mode !== "smtp"
  });

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("port is invalid.");
  }

  return {
    mode,
    host,
    port,
    secure,
    user,
    pass,
    from
  };
}

function validateMailTestBody(input = {}) {
  const payload = expectPlainObject(input, "Invalid mail test payload.");
  const to = requireStringField(payload.to ?? "", "to", {
    min: 3,
    max: 255,
    allowEmpty: false
  });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("to must be a valid email address.");
  }

  return {
    to,
    config: validateMailConfigBody(payload.config ?? {})
  };
}

function validateStyleProfileBody(input = {}, userId) {
  const payload = expectPlainObject(input, "Invalid style profile payload.");
  const name = requireStringField(payload.name ?? "", "style name", {
    min: 1,
    max: 64,
    allowEmpty: false
  });
  const styleKey = requireStringField(payload.styleKey ?? payload.key ?? name, "style key", {
    min: 1,
    max: 64,
    pattern: /^[a-zA-Z0-9._-]+$/,
    allowEmpty: false
  }).toLowerCase();

  return {
    id: String(payload.id || ""),
    userId: String(userId || ""),
    styleKey,
    name,
    description: requireStringField(payload.description ?? "", "style description", {
      max: 400,
      allowEmpty: true
    }),
    userStylePrompt: requireStringField(payload.userStylePrompt ?? "", "style prompt", {
      max: 6000,
      allowEmpty: true
    })
  };
}

function readCookieValue(rawCookie, key) {
  return String(rawCookie || "")
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
    .find((item) => item?.key === key)?.value || "";
}

async function resolveRequestContext(req) {
  const auth = await getSessionFromRequest(req);
  return {
    auth,
    scope: buildRuntimeScope(auth?.user?.id || null)
  };
}

function getRequestedStyleProfileId(req, body = null) {
  if (body && typeof body.styleProfileId === "string") {
    return body.styleProfileId.trim();
  }

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    return String(url.searchParams.get("styleProfileId") || "").trim();
  } catch {
    return "";
  }
}

function normalizeChatSessionId(value = "") {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,96}$/.test(normalized) ? normalized : "";
}

function getRequestedChatSessionId(req, body = null) {
  if (body && typeof body.chatSessionId === "string") {
    return normalizeChatSessionId(body.chatSessionId);
  }

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    return normalizeChatSessionId(url.searchParams.get("chatSessionId") || "");
  } catch {
    return "";
  }
}

async function resolveStyleScope(context, requestedStyleProfileId = "") {
  if (!context?.auth?.user?.id) {
    return {
      ...context,
      styleProfile: null
    };
  }

  const userId = context.auth.user.id;
  const defaultStyleId = ensureDefaultStyleProfileForUser(userId, context.auth.user.createdAt || new Date().toISOString());
  const desiredStyleId = requestedStyleProfileId || defaultStyleId;
  const styleProfile = readStyleProfileById(userId, desiredStyleId) || readStyleProfileById(userId, defaultStyleId);

  if (!styleProfile) {
    throw new Error("Style profile not found.");
  }

  return {
    ...context,
    styleProfile,
    scope: buildRuntimeScope(userId, styleProfile.id)
  };
}

function withChatSessionScope(scope, chatSessionId) {
  return {
    ...scope,
    chatSessionId: normalizeChatSessionId(chatSessionId)
  };
}

function ensureChatSessionForScope(scope = buildRuntimeScope(), requestedChatSessionId = "") {
  if (!scope.userId) {
    return withChatSessionScope(scope, requestedChatSessionId || "local");
  }

  const now = new Date().toISOString();
  const requested = normalizeChatSessionId(requestedChatSessionId);
  const existing = requested ? readChatSessionByIdFromDb(scope.userId, requested) : null;
  if (existing) {
    return withChatSessionScope(scope, existing.id);
  }

  const latest = requested ? null : readLatestChatSessionFromDb(scope.userId, scope.styleProfileId);
  const sessionId = requested || latest?.id || "default";
  if (!latest || requested) {
    upsertChatSessionInDb({
      id: sessionId,
      userId: scope.userId,
      styleProfileId: scope.styleProfileId,
      createdAt: now,
      updatedAt: now
    });
  }

  return withChatSessionScope(scope, sessionId);
}

const LOCAL_AGENT_TASK_TTL_MS = 30 * 60 * 1000;
const LOCAL_AGENT_ONLINE_WINDOW_MS = 90 * 1000;

function hashLocalAgentToken(token) {
  return createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function createLocalAgentToken() {
  return `hsloc_${randomBytes(32).toString("base64url")}`;
}

function readBearerToken(req) {
  const authorization = String(req.headers.authorization || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function normalizeLocalAgentDeviceName(value = "") {
  const normalized = sanitizeBoundedText(value, 80);
  return normalized || "Local Codex Agent";
}

function sanitizeBoundedRawText(value = "", maxLength = 12000) {
  const raw = String(value || "").replace(/\u0000/g, "");
  return raw.length > maxLength ? raw.slice(0, maxLength) : raw;
}

function normalizeLocalAgentCapabilities(value = {}) {
  const input = isPlainObject(value) ? value : {};
  return {
    codexExec: input.codexExec !== false,
    computerUse: Boolean(input.computerUse),
    platform: sanitizeBoundedText(input.platform || "", 80)
  };
}

function localAgentDeviceClientRecord(device) {
  if (!device) {
    return null;
  }

  const lastSeenAtMs = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
  return {
    ...device,
    online: Boolean(
      !device.revokedAt &&
      lastSeenAtMs &&
      Number.isFinite(lastSeenAtMs) &&
      Date.now() - lastSeenAtMs <= LOCAL_AGENT_ONLINE_WINDOW_MS
    )
  };
}

function normalizeLocalAgentTaskPrompt(value = "") {
  return sanitizeBoundedRawText(value, 24000).trim();
}

function normalizeLocalAgentTaskType(value = "") {
  return String(value || "").trim() === "computer_use" ? "computer_use" : "codex_exec";
}

async function resolveLocalAgentDeviceFromRequest(req, res) {
  const token = readBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "Local Agent bearer token required." });
    return null;
  }

  const device = readLocalAgentDeviceByTokenHashFromDb(hashLocalAgentToken(token));
  if (!device || device.revokedAt) {
    sendJson(res, 401, { error: "Local Agent token is invalid or revoked." });
    return null;
  }

  return device;
}

function requireAuthenticatedUser(res, context) {
  if (!authEnabled) {
    return true;
  }

  if (context?.auth?.user) {
    return true;
  }

  sendJson(res, 401, {
    error: "Please sign in first.",
    authRequired: true
  });
  return false;
}

function requireAdminUser(res, context) {
  if (!requireAuthenticatedUser(res, context)) {
    return false;
  }

  const req = res?.__hegelRequest;
  if (req && !isAllowedAdminIp(getClientIp(req))) {
    recordSecurityAuditEvent({
      eventType: "admin_ip_blocked",
      severity: "warning",
      userId: context?.auth?.user?.id || null,
      loginIdentifier: context?.auth?.user?.email || context?.auth?.user?.account || null,
      ipAddress: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
      route: req.url || ""
    });
    recordSecurityAlert({
      alertType: "admin_ip_blocked",
      severity: "warning",
      userId: context?.auth?.user?.id || null,
      loginIdentifier: context?.auth?.user?.email || context?.auth?.user?.account || null,
      ipAddress: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
      route: req.url || "",
      message: "Administrator access was attempted from a non-whitelisted IP address.",
      details: {}
    }).catch(() => {});
    sendJson(res, 403, {
      error: "Administrator access is limited to local or whitelisted IP addresses."
    });
    return false;
  }

  if (isAdminUser(context?.auth?.user)) {
    return true;
  }

  sendJson(res, 403, {
    error: "Administrator access required."
  });
  return false;
}

function defaultDirectoryStats() {
  return {
    fileCount: 0,
    directoryCount: 0,
    totalBytes: 0
  };
}

async function collectDirectoryStats(path) {
  if (!existsSync(path)) {
    return defaultDirectoryStats();
  }

  const directoryEntries = await readdir(path, { withFileTypes: true });
  const totals = defaultDirectoryStats();

  for (const entry of directoryEntries) {
    const resolved = join(path, entry.name);
    if (entry.isDirectory()) {
      totals.directoryCount += 1;
      const nested = await collectDirectoryStats(resolved);
      totals.fileCount += nested.fileCount;
      totals.directoryCount += nested.directoryCount;
      totals.totalBytes += nested.totalBytes;
      continue;
    }

    if (entry.isFile()) {
      const fileStat = await stat(resolved);
      totals.fileCount += 1;
      totals.totalBytes += fileStat.size;
    }
  }

  return totals;
}

async function clearDirectoryContents(path) {
  if (!existsSync(path)) {
    return;
  }

  const entries = await readdir(path, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      rm(join(path, entry.name), {
        recursive: true,
        force: true
      })
    )
  );
}

function normalizeProjectApiConfig(input = {}) {
  const provider = String(input.provider || defaultProjectApiConfig.provider).trim();
  const model = String(input.model || defaultProjectApiConfig.model).trim();
  const baseURL = canonicalizeApiBaseURL(
    String(input.baseURL || input.baseUrl || defaultProjectApiConfig.baseURL).trim(),
    provider
  );
  const apiKey = String(input.apiKey || "").trim();

  return {
    provider,
    model,
    baseURL,
    apiKey
  };
}

function hasAnyApiConfigValue(input = {}) {
  return Boolean(
    String(input.provider || "").trim() ||
    String(input.model || "").trim() ||
    String(input.baseURL || input.baseUrl || "").trim() ||
    String(input.apiKey || "").trim()
  );
}

async function readProjectApiConfig() {
  await mkdir(configDir, { recursive: true });

  if (!existsSync(localApiConfigPath)) {
    return { ...defaultProjectApiConfig };
  }

  return readJsonFileWithRecovery(localApiConfigPath, { ...defaultProjectApiConfig }, {
    normalize: normalizeProjectApiConfig,
    rewriteOnFailure: true
  });
}

async function writeProjectApiConfig(input) {
  await mkdir(configDir, { recursive: true });
  const config = normalizeProjectApiConfig(input);
  await writeJsonFileAtomic(localApiConfigPath, config);
  return config;
}

async function readScopedApiConfig(scope = buildRuntimeScope()) {
  if (scope.userId) {
    const row = readUserApiConfigFromDb(scope.userId);
    return normalizeProjectApiConfig(row || {});
  }

  await ensureDataDirs(scope);
  if (!existsSync(scope.apiConfigPath)) {
    return { ...defaultProjectApiConfig };
  }

  return readJsonFileWithRecovery(scope.apiConfigPath, { ...defaultProjectApiConfig }, {
    normalize: normalizeProjectApiConfig,
    rewriteOnFailure: true
  });
}

async function writeScopedApiConfig(scope = buildRuntimeScope(), input = {}) {
  if (scope.userId) {
    return normalizeProjectApiConfig(writeUserApiConfigToDb(scope.userId, input));
  }

  await ensureDataDirs(scope);
  const config = normalizeProjectApiConfig(input);
  await writeJsonFileAtomic(scope.apiConfigPath, config);
  return config;
}

async function resolveEffectiveApiConfig(scope = buildRuntimeScope()) {
  const scoped = await readScopedApiConfig(scope);

  if (scope.userId) {
    return {
      provider: scoped.provider || "",
      model: scoped.model || "",
      baseURL: scoped.baseURL || "",
      apiKey: scoped.apiKey || "",
      envKey: "OPENAI_API_KEY",
      requiresOpenAIAuth: true,
      usingScopeConfig: hasAnyApiConfigValue(scoped),
      scopedConfig: scoped
    };
  }

  const base = loadCodexOpenAIConfig();

  return {
    provider: scoped.provider || base.provider || "",
    model: scoped.model || base.model || "",
    baseURL: scoped.baseURL || base.baseURL || "",
    apiKey: scoped.apiKey || base.apiKey || "",
    envKey: base.envKey,
    requiresOpenAIAuth: base.requiresOpenAIAuth,
    usingScopeConfig: hasAnyApiConfigValue(scoped),
    scopedConfig: scoped
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname =
    url.pathname === "/"
      ? "/index.html"
      : url.pathname === "/admin"
        ? "/admin.html"
        : url.pathname;
  const resolved = normalize(join(publicDir, pathname));

  if (!resolved.startsWith(publicDir)) {
    sendJson(res, 403, { error: "\u7981\u6b62\u8bbf\u95ee\u3002" });
    return;
  }

  if (!existsSync(resolved)) {
    sendJson(res, 404, { error: "\u672a\u627e\u5230\u8d44\u6e90\u3002" });
    return;
  }

  const fileStat = await stat(resolved);
  if (fileStat.isDirectory()) {
    sendJson(res, 404, { error: "\u672a\u627e\u5230\u8d44\u6e90\u3002" });
    return;
  }

  const ext = extname(resolved).toLowerCase();
  const noCache =
    ext === ".html" || ext === ".css" || ext === ".js" || ext === ".json";
  res.writeHead(200, {
    "Cache-Control": noCache ? "no-store, max-age=0" : "public, max-age=3600",
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    ...buildCorsHeaders(req),
    ...buildSecurityHeaders(req, { html: ext === ".html" })
  });
  createReadStream(resolved).pipe(res);
}

async function serveLocalAgentRunner(req, res) {
  if (!existsSync(localAgentRunnerScriptPath)) {
    sendJson(res, 404, { error: "Local Agent runner was not found." });
    return;
  }

  res.writeHead(200, {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/javascript; charset=utf-8",
    ...buildCorsHeaders(req),
    ...buildSecurityHeaders(req)
  });
  createReadStream(localAgentRunnerScriptPath).pipe(res);
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  const limitBytes = MAX_JSON_BODY_BYTES;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > limitBytes) {
      throw new Error("JSON body too large.");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
  return raw ? JSON.parse(raw) : {};
}

function ensureJsonRequest(req, res) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return true;
  }

  sendJson(res, 415, {
    error: "JSON content-type required."
  });
  return false;
}

async function readMultipartForm(req) {
  const contentLength = Number.parseInt(String(req.headers["content-length"] || "0"), 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) {
    throw new Error("Multipart body too large.");
  }

  const request = new Request(`http://${req.headers.host || "127.0.0.1"}${req.url || "/"}`, {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: "half"
  });

  return request.formData();
}

function inferMediaType(name = "") {
  const ext = extname(String(name || "").toLowerCase());
  const known = {
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

  return known[ext] || "application/octet-stream";
}

function attachmentKindFrom(mediaType = "", name = "") {
  return String(mediaType || inferMediaType(name)).startsWith("image/") ? "image" : "file";
}

function isAllowedAttachmentType(name = "", mediaType = "") {
  const normalizedMediaType = String(mediaType || "").trim().toLowerCase();
  const normalizedExt = extname(String(name || "").toLowerCase());
  return (
    ALLOWED_ATTACHMENT_MEDIA_TYPES.has(normalizedMediaType) &&
    ALLOWED_ATTACHMENT_EXTENSIONS.has(normalizedExt)
  );
}

function sanitizeAttachmentExcerptText(value, maxLength = 16000) {
  return sanitizeBoundedText(
    String(value || "")
      .replace(/\0/g, "")
      .replace(/[^\S\r\n\t]+/g, " ")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""),
    maxLength
  );
}

function findWindowsDefenderCliPath() {
  return DEFENDER_CANDIDATE_PATHS.find((candidate) => existsSync(candidate)) || null;
}

async function scanUploadedFileForThreats(filePath) {
  if (uploadScanMode === "off") {
    return { scanned: false, clean: true };
  }

  if (process.platform === "linux") {
    const linuxScanner = existsSync("/usr/bin/clamdscan")
      ? { command: "/usr/bin/clamdscan", args: ["--no-summary", filePath] }
      : existsSync("/usr/bin/clamscan")
        ? { command: "/usr/bin/clamscan", args: ["--no-summary", filePath] }
        : null;
    if (!linuxScanner) {
      if (uploadScanMode === "required") {
        throw new Error("Virus scanner is unavailable.");
      }
      return { scanned: false, clean: true };
    }

    try {
      await execFileAsync(linuxScanner.command, linuxScanner.args, {
        windowsHide: true,
        timeout: 60000
      });
      return { scanned: true, clean: true };
    } catch (error) {
      const code = Number(error?.code);
      const combined = `${error?.stdout || ""}\n${error?.stderr || ""}\n${error?.message || ""}`.toLowerCase();
      if (code === 1 || /(infected|found virus|malware)/i.test(combined)) {
        throw new Error("Malware detected in uploaded file.");
      }
      if (uploadScanMode === "required") {
        throw new Error("Virus scan failed.");
      }
      return { scanned: false, clean: true };
    }
  }

  const cliPath = findWindowsDefenderCliPath();
  if (!cliPath) {
    if (uploadScanMode === "required") {
      throw new Error("Virus scanner is unavailable.");
    }
    return { scanned: false, clean: true };
  }

  try {
    const result = await execFileAsync(
      cliPath,
      ["-Scan", "-ScanType", "3", "-File", filePath, "-DisableRemediation"],
      {
        windowsHide: true,
        timeout: 60000
      }
    );
    const combined = `${result.stdout || ""}\n${result.stderr || ""}`.toLowerCase();
    if (
      /(threat|virus|infected|malware)/i.test(combined) &&
      !/(no threats?|found no|no malware)/i.test(combined)
    ) {
      throw new Error("Malware detected in uploaded file.");
    }
    return { scanned: true, clean: true };
  } catch (error) {
    const combined = `${error?.stdout || ""}\n${error?.stderr || ""}\n${error?.message || ""}`.toLowerCase();
    if (
      /(threat|virus|infected|malware)/i.test(combined) &&
      !/(no threats?|found no|no malware)/i.test(combined)
    ) {
      throw new Error("Malware detected in uploaded file.");
    }
    if (uploadScanMode === "required") {
      throw new Error("Virus scan failed.");
    }
    return { scanned: false, clean: true };
  }
}

function validateUploadedFiles(files = []) {
  if (!Array.isArray(files)) {
    throw new Error("Invalid attachments payload.");
  }

  if (files.length > MAX_UPLOAD_FILE_COUNT) {
    throw new Error(`Too many attachments. Maximum is ${MAX_UPLOAD_FILE_COUNT}.`);
  }

  let totalBytes = 0;

  files.forEach((file) => {
    if (!file || typeof file === "string") {
      throw new Error("Invalid attachment.");
    }

    const name = String(file.name || "attachment").trim();
    const mediaType = String(file.type || "").trim() || inferMediaType(name);
    const size = Number(file.size || 0);

    if (!isAllowedAttachmentType(name, mediaType)) {
      throw new Error(`Unsupported attachment type: ${name || "attachment"}.`);
    }

    if (!Number.isFinite(size) || size < 0 || size > MAX_UPLOAD_FILE_BYTES) {
      throw new Error(`Attachment is too large: ${name || "attachment"}.`);
    }

    totalBytes += size;
  });

  if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
    throw new Error("Total attachment payload is too large.");
  }
}

function normalizeAttachmentRecord(input = {}) {
  const name = String(input.name || input.filename || "").trim().slice(0, 255);
  const mediaType = String(input.mediaType || input.mimeType || "").trim() || inferMediaType(name);
  const fileId = String(input.fileId || input.file_id || "").trim();
  const excerpt = sanitizeBoundedText(input.excerpt || input.textExcerpt || "", 16000);
  const imageUrl = String(input.imageUrl || input.image_url || "").trim();
  const kind = input.kind === "image" || attachmentKindFrom(mediaType, name) === "image" ? "image" : "file";
  const size = Number(input.size);

  return {
    kind,
    name: name || "attachment",
    mediaType,
    fileId: fileId || null,
    size: Number.isFinite(size) && size >= 0 ? size : null,
    excerpt: excerpt || null,
    imageUrl: imageUrl || null
  };
}

function normalizeHistoryInput(history = [], limit = NORMALIZED_HISTORY_LIMIT) {
  if (!Array.isArray(history)) {
    return [];
  }

  const resolvedLimit = Number(limit);
  const source = Number.isFinite(resolvedLimit) && resolvedLimit > 0
    ? history.slice(-resolvedLimit)
    : history;

  return source
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      role: item.role,
      content: typeof item.content === "string" ? sanitizeBoundedText(item.content, 12000) : "",
      attachments: Array.isArray(item.attachments)
        ? item.attachments
            .slice(0, 8)
            .map(normalizeAttachmentRecord)
            .filter((attachment) => attachment.fileId || attachment.name)
        : []
    }));
}

function limitRecentHistory(history = [], limit = CHAT_MODEL_HISTORY_LIMIT) {
  const normalized = normalizeHistoryInput(history);
  const resolvedLimit = Number(limit);
  if (!Number.isFinite(resolvedLimit)) {
    return normalized;
  }
  return normalized.slice(-Math.max(1, resolvedLimit));
}

function looksLikeSmTopic(content = "") {
  return /(^|\b|[\s，。！？：；、])s\s*\/?\s*m($|\b|[\s，。！？：；、])|施虐|受虐|支配|服从|调教|BDSM/i.test(
    String(content || "")
  );
}

function buildSmDialecticalFallbackReply(content = "") {
  const asksToDiscuss = /谈谈|说说|讲讲|解释|聊聊|怎么看|是什么|为何|为什么/i.test(content);
  const lead = asksToDiscuss
    ? "谈 SM，不能先从猎奇开始，而要先问：支配与服从怎样被同意、规则和承认中介。"
    : "如果你说“就是 SM”，我先把它确定为一种围绕支配、服从、痛感边界和相互承认组织起来的关系形式。";

  return [
    lead,
    "黑格尔式地说，危险不在于有强弱位置本身，而在于一方把另一方降成纯粹物；只要边界、同意和可撤回性仍然有效，所谓支配就不是赤裸占有，而是一种被双方承认的表演性关系。",
    "所以真正要判断的不是“它刺激不刺激”，而是：欲望有没有把对方当作自由者来承认。"
  ].join("\n\n");
}

function buildShortHegelFallbackReply(content = "") {
  const topic = sanitizeBoundedText(content, 160) || "这个问题";

  if (/自由/u.test(topic)) {
    return "自由不是随便做什么，而是在限制中仍能把行动认作自己的理性规定；没有这种自我规定，任性只是欲望换了名字。";
  }

  if (/承认|认可|主奴|主人|奴隶/u.test(topic)) {
    return "承认不能单方面给予，因为我只有在另一个自由者的回应中才真正成为自己；若对方只是物，我得到的就不是承认，而只是回声。";
  }

  if (/你好|嗨|hello|hi/i.test(topic)) {
    return "我在。把问题抛过来，我们不急着找结论，先把概念本身逼到它必须说清楚的位置。";
  }

  return [
    `我先按“${topic}”来回答，而不把问题退回给你。`,
    "黑格尔式的入口是：不要把它当成一个孤立标签，而要看它在什么关系中取得意义、它依赖什么反面、又怎样要求被承认。",
    "如果你愿意继续，我们可以马上把它推进一步：它是欲望的问题、权力的问题，还是承认的问题？"
  ].join("\n\n");
}

function buildPublicFallbackReply(userMessage, error = null) {
  const content = normalizeWhitespace(userMessage?.content || "");
  const memoryWriteMatch = content.match(/^(?:请)?记住[:：]?\s*(.+)$/u);
  if (memoryWriteMatch?.[1]) {
    return `记住了：${sanitizeBoundedText(memoryWriteMatch[1], 220)}`;
  }

  if (looksLikeSmTopic(content)) {
    return buildSmDialecticalFallbackReply(content);
  }

  if (content.length <= 80) {
    return buildShortHegelFallbackReply(content);
  }

  return [
    "这轮我先不把问题退还给你，而直接给出一个可继续推进的判断。",
    `你问的是：“${sanitizeBoundedText(content, 220)}”。`,
    "它的关键不在表面措辞，而在它背后的关系结构：一个概念只有经过它的反面、边界和承认，才不只是空名。"
  ].filter(Boolean).join("\n\n");
}

function getMessageText(message) {
  return normalizeWhitespace(message?.content || "");
}

function getMessageAttachments(message) {
  return Array.isArray(message?.attachments) ? message.attachments : [];
}

function hasMessagePayload(message) {
  return Boolean(getMessageText(message)) || getMessageAttachments(message).length > 0;
}

function buildRecentQuestionRecallReply(history = [], latestUserIndex = -1) {
  const latest = history[latestUserIndex];
  const prompt = normalizeWhitespace(latest?.content || "");
  if (!prompt) {
    return "";
  }

  const asksRecentQuestion =
    /刚才.*(问|说)|上一(句|条|个).*(问|说)|前面.*(问|说)|记得.*(刚才|上一|前面)/u.test(prompt) ||
    /what did i (just|previously) ask|previous question|last question/i.test(prompt);
  if (!asksRecentQuestion) {
    return "";
  }

  const previousUser = history
    .slice(0, Math.max(0, latestUserIndex))
    .reverse()
    .find((message) => message?.role === "user" && normalizeWhitespace(message.content || ""));
  if (!previousUser) {
    return "我这里还没有可追溯的上一条用户问题。";
  }

  return `你刚才问的是：“${sanitizeBoundedText(previousUser.content || "", 220)}”。`;
}

function buildDurableMemoryRecallReply(history = [], latestUserIndex = -1, scope = buildRuntimeScope()) {
  const latest = history[latestUserIndex];
  const prompt = normalizeWhitespace(latest?.content || "");
  if (!prompt || /^请?记住[:：]?/u.test(prompt)) {
    return "";
  }

  const asksDurableMemory =
    /你记得.*(长期目标|目标|记忆)|当前记忆.*(长期目标|目标)|长期目标是什么|我的长期目标是什么/u.test(prompt);
  if (!asksDurableMemory || !scope?.userId) {
    return "";
  }

  const longTermProfile = readUserLongTermMemoryProfileFromDb(scope.userId);
  const styleMemoryProfile = readUserMemoryProfileFromDb(scope.userId, scope.styleProfileId);
  const lines = [
    ...collectMemorySummaryLines(longTermProfile?.summaryText || "", 30),
    ...collectMemorySummaryLines(styleMemoryProfile?.summaryText || "", 30)
  ];
  const targetLine = lines.find((line) =>
    /长期目标|目标是|Hegel Salon.*记忆机制|上下文窗口/u.test(line)
  );
  if (!targetLine) {
    return "";
  }

  const cleaned = sanitizeBoundedText(targetLine.replace(/^记住[:：]?\s*/u, ""), 260);
  const goalMatch = cleaned.match(/我的长期目标是(.+)$/u);
  if (goalMatch?.[1]) {
    return `你的长期目标是${goalMatch[1]}`;
  }

  return `我记得：${cleaned}`;
}

function attachmentHasLocalText(attachment) {
  return Boolean(normalizeWhitespace(attachment?.excerpt || ""));
}

function buildAttachmentContextText(message) {
  const blocks = getMessageAttachments(message)
    .filter(attachmentHasLocalText)
    .map((attachment) => {
      const header = `[Attachment: ${attachment.name}]`;
      return `${header}\n${normalizeWhitespace(attachment.excerpt)}`;
    });

  return blocks.join("\n\n");
}

function buildMessagePromptText(message) {
  const text = getMessageText(message);
  const attachmentText = buildAttachmentContextText(message);

  if (text && attachmentText) {
    return `${text}\n\n${attachmentText}`;
  }

  return text || attachmentText;
}

function findLatestUserMessageIndex(history) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === "user") {
      return index;
    }
  }

  return -1;
}

function createOpenAIClient(config) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
}

function isEndpointNotFoundError(error) {
  const message = String(error?.message || error || "");
  return /\b404\b/.test(message) || /page not found/i.test(message);
}

function getResponsesFallbackConfig(primaryConfig) {
  const fallback = loadCodexResponsesFallbackConfig();
  if (!fallback?.apiKey || !fallback?.baseURL) {
    return null;
  }

  if (fallback.baseURL === primaryConfig.baseURL) {
    return null;
  }

  return {
    ...fallback,
    model: primaryConfig.model || fallback.model
  };
}

function buildResponseMessageContent(message) {
  const content = [];
  const text = buildMessagePromptText(message);

  if (text) {
    content.push({
      type: "input_text",
      text
    });
  }

  for (const attachment of getMessageAttachments(message)) {
    if (!attachment?.fileId && !attachment?.imageUrl) {
      continue;
    }

    if (attachment.kind === "image") {
      content.push({
        type: "input_image",
        file_id: attachment.fileId,
        image_url: attachment.imageUrl || undefined,
        detail: "auto"
      });
      continue;
    }

    content.push({
      type: "input_file",
      file_id: attachment.fileId,
      filename: attachment.name
    });
  }

  return content;
}

function buildResponseInput(history) {
  return history
    .map((message) => {
      const content = buildResponseMessageContent(message);
      if (!content.length) {
        return null;
      }

      return {
        role: message.role,
        content
      };
    })
    .filter(Boolean);
}

function collectCodeInterpreterFileIds(history) {
  function needsCodeInterpreter(attachment) {
    const mediaType = String(attachment?.mediaType || "").toLowerCase();
    const name = String(attachment?.name || "").toLowerCase();
    return (
      mediaType.includes("spreadsheetml") ||
      mediaType === "application/vnd.ms-excel" ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls")
    );
  }

  return [...new Set(
    history.flatMap((message) =>
      getMessageAttachments(message)
        .filter(
          (attachment) =>
            attachment.kind === "file" &&
            attachment.fileId &&
            needsCodeInterpreter(attachment)
        )
        .map((attachment) => attachment.fileId)
    )
  )];
}

function buildResponseTools(history) {
  const fileIds = collectCodeInterpreterFileIds(history);
  if (!fileIds.length) {
    return [];
  }

  return [
    {
      type: "code_interpreter",
      container: {
        type: "auto",
        file_ids: fileIds
      }
    }
  ];
}

async function uploadAttachments(client, files, scope = buildRuntimeScope()) {
  const attachments = [];

  for (const file of files) {
    if (!file || typeof file === "string") {
      continue;
    }

    const name = String(file.name || "attachment");
    const mediaType = String(file.type || "").trim() || inferMediaType(name);
    const kind = attachmentKindFrom(mediaType, name);
    const size = Number.isFinite(file.size) ? file.size : null;

    if (!isAllowedAttachmentType(name, mediaType)) {
      throw new Error(`Unsupported attachment type: ${name || "attachment"}.`);
    }

    if (!Number.isFinite(size) || size < 0 || size > MAX_UPLOAD_FILE_BYTES) {
      throw new Error(`Attachment is too large: ${name || "attachment"}.`);
    }

    if (kind !== "image") {
      const localAttachment = await buildLocalAttachmentRecord(file, scope);
      if (localAttachment) {
        attachments.push(localAttachment);
      }
      continue;
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const imageUrl = `data:${mediaType};base64,${bytes.toString("base64")}`;

      attachments.push({
        kind,
        name,
        mediaType,
        size,
        fileId: null,
        excerpt: null,
        imageUrl
      });
  }

  return attachments;
}

async function persistUploadedFile(file, scope = buildRuntimeScope()) {
  await ensureDataDirs(scope);
  const safeName = String(file.name || "attachment").replace(/[^\w.\-]+/g, "_");
  const savedName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const path = join(scope.uploadsDir, savedName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path, bytes);
  try {
    await scanUploadedFileForThreats(path);
    return {
      path,
      size: bytes.length
    };
  } catch (error) {
    await rm(path, { force: true }).catch(() => {});
    throw error;
  }
}

function summarizePlainText(raw, name) {
  const text = sanitizeAttachmentExcerptText(raw, 32000);
  if (!text) {
    return "";
  }

  return text.length > 16000 ? `${text.slice(0, 16000)}\n\n[Truncated from ${name}]` : text;
}

async function extractWithPython(path, mode) {
  const script = `
import json
import sys
from pathlib import Path

mode = sys.argv[1]
path = Path(sys.argv[2])

def emit(payload):
    print(json.dumps(payload, ensure_ascii=False))

if mode == "pdf":
    from pypdf import PdfReader
    reader = PdfReader(str(path))
    pages = []
    for index, page in enumerate(reader.pages[:20], start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append(f"[Page {index}]\\n{text}")
    emit({"text": "\\n\\n".join(pages)[:20000]})
elif mode == "sheet":
    import pandas as pd
    suffix = path.suffix.lower()
    blocks = []
    if suffix in [".csv", ".tsv"]:
        sep = "\\t" if suffix == ".tsv" else ","
        frame = pd.read_csv(path, sep=sep)
        blocks.append(f"[Sheet: {path.name}]\\n" + frame.head(50).to_csv(index=False))
    else:
        sheets = pd.read_excel(path, sheet_name=None)
        for name, frame in list(sheets.items())[:6]:
            blocks.append(f"[Sheet: {name}]\\n" + frame.head(50).to_csv(index=False))
    emit({"text": "\\n\\n".join(blocks)[:20000]})
else:
    emit({"text": ""})
`;

  const pythonPath = existsSync(bundledPythonPath) ? bundledPythonPath : "python";
  const { stdout } = await execFileAsync(pythonPath, ["-c", script, mode, path], {
    maxBuffer: 10 * 1024 * 1024
  });

  return parseJsonSafe(stdout).text || "";
}

async function buildLocalAttachmentRecord(file, scope = buildRuntimeScope()) {
  const name = String(file.name || "attachment");
  const mediaType = String(file.type || "").trim() || inferMediaType(name);
  const kind = attachmentKindFrom(mediaType, name);
  const size = Number.isFinite(file.size) ? file.size : null;

  if (kind === "image") {
    return null;
  }

  const persisted = await persistUploadedFile(file, scope);
  try {
    const lowerName = name.toLowerCase();
    let excerpt = "";

    if (
      mediaType.startsWith("text/") ||
      mediaType === "application/json" ||
      mediaType === "text/markdown"
    ) {
      excerpt = summarizePlainText(await file.text(), name);
    } else if (lowerName.endsWith(".pdf")) {
      excerpt = summarizePlainText(await extractWithPython(persisted.path, "pdf"), name);
    } else if (
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls") ||
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".tsv")
    ) {
      excerpt = summarizePlainText(await extractWithPython(persisted.path, "sheet"), name);
    }

    if (!excerpt) {
      return {
        kind: "file",
        name,
        mediaType,
        size,
        fileId: null,
        excerpt: `[Attachment: ${name}] This file was attached, but no local text could be extracted automatically.`
      };
    }

    return {
      kind: "file",
      name,
      mediaType,
      size,
      fileId: null,
      excerpt
    };
  } finally {
    if (!retainUploadedFiles) {
      await rm(persisted.path, { force: true }).catch(() => {});
    }
  }
}

function buildChatCompletionMessages(systemPrompt, history) {
  const messages = [{ role: "system", content: systemPrompt }];

  for (const item of history) {
    if (!item) {
      continue;
    }

    const content = buildMessagePromptText(item);
    const imageAttachments = getMessageAttachments(item).filter(
      (attachment) => attachment.kind === "image" && attachment.imageUrl
    );

    if (!content && !imageAttachments.length) {
      continue;
    }

    if (item.role !== "user" && item.role !== "assistant") {
      continue;
    }

    if (item.role === "user" && imageAttachments.length) {
      const parts = [];
      if (content) {
        parts.push({
          type: "text",
          text: content
        });
      }

      imageAttachments.forEach((attachment) => {
        parts.push({
          type: "image_url",
          image_url: {
            url: attachment.imageUrl
          }
        });
      });

      messages.push({
        role: item.role,
        content: parts
      });
      continue;
    }

    messages.push({ role: item.role, content });
  }

  return messages;
}

function toApiUrl(baseURL, path) {
  const normalizedBaseURL = canonicalizeApiBaseURL(baseURL);
  return new URL(path, `${String(normalizedBaseURL).replace(/\/+$/, "")}/`).toString();
}

function extractChunkText(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  let text = "";

  for (const choice of choices) {
    const deltaContent = choice?.delta?.content;
    const messageContent = choice?.message?.content;

    if (typeof deltaContent === "string") {
      text += deltaContent;
      continue;
    }

    if (Array.isArray(deltaContent)) {
      text += deltaContent
        .map((part) => {
          if (typeof part === "string") return part;
          if (typeof part?.text === "string") return part.text;
          if (typeof part?.content === "string") return part.content;
          return "";
        })
        .join("");
      continue;
    }

    if (typeof messageContent === "string") {
      text += messageContent;
    }
  }

  return text;
}

function sanitizeSalonReply(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/\r/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/^\s*$/gm, "")
    .replace(/I am (an )?(AI|assistant|language model|model|software)[^.\n]*[.\n]?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rewriteTowardFirstPerson(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/\bHegel holds\b/gi, "I hold")
    .replace(/\bHegel says\b/gi, "I say")
    .replace(/\bHegel argues\b/gi, "I argue")
    .replace(/\bhe says\b/gi, "I say")
    .trim();
}

function tightenSalonCadence(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/^\s*(let me begin|first of all|to put it briefly)[:闂?\s]*/gim, "")
    .replace(/^\s*(as Hegel|in Hegel's voice|from Hegel's standpoint)[^.\n]*[.\n]?/gim, "")
    .replace(/\n?\s*so I determine it in this way\.?\s*$/i, "")
    .replace(/\n?\s*this is how I determine it\.?\s*$/i, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function ensureDataDirs(scope = buildRuntimeScope()) {
  await ensureRuntimeScopeDirs(scope);
}

function shouldPersistUserContent(scope = buildRuntimeScope()) {
  if (!scope.userId) {
    return true;
  }

  return persistAuthenticatedUserContent;
}

async function persistResearchSnapshot(systemPrompt) {
  await ensureDataDirs();

  for (const file of snapshotFiles) {
    try {
      const content = await readFile(join(distillRoot, file), "utf8");
      await writeFile(join(researchDir, file), content, "utf8");
    } catch {
      // Keep snapshotting resilient even if some round files are absent.
    }
  }

  await writeFile(join(researchDir, "system-prompt.txt"), systemPrompt, "utf8");
}

async function appendChatLog(history, reply, scope = buildRuntimeScope()) {
  if (scope.userId) {
    const sessionScope = ensureChatSessionForScope(scope, scope.chatSessionId);
    const existingConversation = await readPersistedConversation(sessionScope);
    const mergedHistory = mergeConversationHistoryWithoutDuplicate(existingConversation, history);
    const fullConversation = reply
      ? [...mergedHistory, { role: "assistant", content: reply, attachments: [] }]
      : mergedHistory;
    const now = new Date().toISOString();

    appendChatSessionMessagesToDb(
      sessionScope.userId,
      sessionScope.styleProfileId,
      sessionScope.chatSessionId,
      fullConversation,
      now
    );
    appendUserChatLogToDb(
      sessionScope.userId,
      sessionScope.styleProfileId,
      normalizeHistoryInput(history),
      reply,
      now,
      sessionScope.chatSessionId
    );
    refreshChatSessionMemoryProfileHeuristically(sessionScope);
    return;
  }

  await ensureDataDirs(scope);
  const payload = {
    history,
    reply,
    timestamp: new Date().toISOString()
  };

  await appendTextFileDurable(
    scope.chatHistoryPath,
    `${JSON.stringify(payload)}\n`,
    "utf8"
  );
}

function sanitizeMemoryMessage(message) {
  return {
    role: message?.role === "assistant" ? "assistant" : "user",
    content: normalizeWhitespace(message?.content || ""),
    attachments: Array.isArray(message?.attachments)
      ? message.attachments.map((attachment) => ({
          kind: attachment?.kind === "image" ? "image" : "file",
          name: String(attachment?.name || "attachment"),
          mediaType: String(attachment?.mediaType || ""),
          size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : null
        }))
      : []
  };
}

async function appendUserMemoryTurn(userMessage, reply, scope = buildRuntimeScope()) {
  if (scope.userId) {
    appendUserMemoryTurnToDb(
      scope.userId,
      scope.styleProfileId,
      sanitizeMemoryMessage(userMessage),
      sanitizeMemoryMessage({
        role: "assistant",
        content: reply,
        attachments: []
      }),
      new Date().toISOString(),
      scope.chatSessionId || "default"
    );
    return;
  }

  await ensureDataDirs(scope);
  const record = {
    timestamp: new Date().toISOString(),
    user: sanitizeMemoryMessage(userMessage),
    assistant: sanitizeMemoryMessage({
      role: "assistant",
      content: reply,
      attachments: []
    })
  };

  await appendTextFileDurable(scope.memoryPath, `${JSON.stringify(record)}\n`, "utf8");
}

function persistChatResultInBackground({
  scope,
  history = [],
  reply = "",
  result = {},
  latestUser = null,
  allowMemoryRefresh = false
} = {}) {
  if (!scope || !shouldPersistUserContent(scope)) {
    return;
  }

  const userMessage = result.userMessage || latestUser;
  const persistedHistory = limitRecentHistory(
    result.history || history || (userMessage ? [userMessage] : []),
    CHAT_STORAGE_HISTORY_LIMIT
  );
  const qualityJudge = result.qualityJudge || buildQualityJudgeDefault();
  const strictLogicJudge = result.strictLogicJudge || buildStrictLogicJudgeDefault();
  const historiographyJudge = result.historiographyJudge || buildHistoriographyJudgeDefault();

  Promise.resolve()
    .then(async () => {
      await appendChatLog(persistedHistory, reply, scope);
      await appendOptimizerRecord({
        userId: scope.userId,
        styleProfileId: scope.styleProfileId,
        prompt: userMessage?.content || "",
        reply,
        qualityJudge,
        strictLogicJudge,
        historiographyJudge,
        selfAudit: result.selfAudit
      });
      if (userMessage) {
        await appendUserMemoryTurn(userMessage, reply, scope);
      }
      if (allowMemoryRefresh && scope.userId && result.usedConfig) {
        await Promise.all([
          refreshUserMemoryProfile(scope, result.usedConfig),
          refreshUserLongTermMemoryProfile(scope, result.usedConfig)
        ]);
      } else if (scope.userId) {
        await refreshUserMemoryProfilesHeuristically(scope);
      }
    })
    .catch((error) => {
      console.warn("Background chat persistence failed:", error?.message || error);
    });
}

async function readRecentUserMemory(scope = buildRuntimeScope(), limit = 24) {
  if (scope.userId) {
    return readRecentUserMemoryTurnsFromDb(scope.userId, scope.styleProfileId, limit).flatMap((record) => [
      sanitizeMemoryMessage(record.userMessage),
      sanitizeMemoryMessage(record.assistantMessage)
    ]);
  }

  try {
    if (!existsSync(scope.memoryPath)) {
      return [];
    }

    const raw = await readFile(scope.memoryPath, "utf8");
    const rows = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(String(line).replace(/^\uFEFF/, ""));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-Math.max(1, limit));

    return rows.flatMap((record) => [
      sanitizeMemoryMessage(record.user),
      sanitizeMemoryMessage(record.assistant)
    ]);
  } catch {
    return [];
  }
}

function normalizeConversationMessages(messages = []) {
  return normalizeHistoryInput(
    Array.isArray(messages)
      ? messages.map((message) => ({
          role: message?.role,
          content: typeof message?.content === "string" ? message.content : "",
          attachments: Array.isArray(message?.attachments) ? message.attachments : []
        }))
      : []
  );
}

function buildConversationFromChatLogRecord(record) {
  if (!record) {
    return [];
  }

  const history = normalizeConversationMessages(record.history);
  const reply = normalizeWhitespace(record.reply || "");
  return reply
    ? [...history, { role: "assistant", content: reply, attachments: [] }]
    : history;
}

async function readPersistedConversation(scope = buildRuntimeScope()) {
  if (scope.userId) {
    const sessionId = normalizeChatSessionId(scope.chatSessionId);
    if (sessionId) {
      const rows = readChatSessionMessagesFromDb(scope.userId, sessionId);
      if (rows.length) {
        return limitRecentHistory(rows, HISTORY_DISPLAY_LIMIT);
      }
    }

    const [latest] = readRecentUserChatLogsFromDb(scope.userId, scope.styleProfileId, 1);
    if (latest && (!sessionId || latest.chatSessionId === sessionId)) {
      return limitRecentHistory(buildConversationFromChatLogRecord(latest), HISTORY_DISPLAY_LIMIT);
    }
  }

  try {
    if (!existsSync(scope.chatHistoryPath)) {
      return [];
    }

    const raw = await readFile(scope.chatHistoryPath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const latest = lines.length
      ? parseJsonSafe(String(lines[lines.length - 1]).replace(/^\uFEFF/, ""))
      : null;
    return limitRecentHistory(buildConversationFromChatLogRecord(latest), HISTORY_DISPLAY_LIMIT);
  } catch {
    return [];
  }
}

function buildUserHistoricalMemoryContextFromRecords(chatLogs = [], memoryTurns = []) {
  const preferenceSignals = [];
  const recentSignals = [];
  const seen = new Set();

  function pushUnique(target, value) {
    const normalized = sanitizeMemorySignalLine(value || "");
    const bucket = target === preferenceSignals ? "pref" : "recent";
    const key = `${bucket}:${normalized}`;
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    target.push(normalized);
  }

  for (const turn of memoryTurns) {
    pushUnique(preferenceSignals, turn?.userMessage?.content || "", 24);
  }

  for (const log of chatLogs) {
    const history = Array.isArray(log?.history) ? log.history : [];
    for (const item of history) {
      const content = normalizeWhitespace(item?.content || "");
      if (!content) continue;
      if (item?.role !== "user") continue;

      if (/记住|偏好|以后|默认|优先|不要|请用|习惯|风格/u.test(content)) {
        pushUnique(preferenceSignals, content, 24);
      }
      pushUnique(recentSignals, content, 20);
    }
  }

  if (!preferenceSignals.length && !recentSignals.length) {
    return "";
  }

  const lines = [
    "User historical memory is active.",
    `Historical chat records: ${chatLogs.length}.`,
    `Historical memory turns: ${memoryTurns.length}.`
  ];

  if (preferenceSignals.length) {
    lines.push("Long-term user preference signals:");
    preferenceSignals.forEach((item) => lines.push(`- ${item}`));
  }

  if (recentSignals.length) {
    lines.push("Recent cross-session conversation signals:");
    recentSignals.forEach((item) => lines.push(`- ${item}`));
  }

  return lines.join("\n");
}

function stripLeadingBulletMarker(line = "") {
  return String(line || "").replace(/^\s*[-*+]\s*/, "").trim();
}

function hasUserPreferenceSignal(text = "") {
  const content = String(text || "");
  return /记住|偏好|以后|默认|优先|不要|请用|习惯|风格|语气|篇幅|格式|用词|避免|附件|上传|项目|长期|一直|持续/u.test(content);
}

function hasDurableMemorySignal(text = "") {
  const content = String(text || "");
  return hasUserPreferenceSignal(content)
    || /目标|任务|需求|要求|希望|需要|必须|正在|当前|以后|长期|持续|项目|修复|升级|部署|公网|域名|入口|上下文|窗口|历史|记忆|压缩|摘要|根修|Hegel Salon|hegelsalon/i.test(content);
}

function hasTransientValidationSignal(text = "") {
  const content = String(text || "");
  const looksTransient = /记忆锚点|入口验收|公网.*验收|重启后.*验收|smoke|测试|test/i.test(content);
  const looksLikeRecallQuery = /确认.*记忆|当前记忆|你记得|记得我|刚才|上一条|前面/u.test(content);
  const explicitlyDurable = /记住[:：]?|我的[^。；\n]{0,20}目标是|长期目标是|需求是|要求是|必须|需要|以后|持续|根修|升级/u.test(content);
  return (looksTransient || looksLikeRecallQuery) && !explicitlyDurable;
}

function hasDogmaticMemoryPattern(text = "") {
  const content = String(text || "");
  return /不是[^。；\n]{0,42}而是[^。；\n]{0,42}/u.test(content)
    || /问题不在于[^。；\n]{0,42}而在于[^。；\n]{0,42}/u.test(content)
    || /真正的[^。；\n]{0,24}不是[^。；\n]{0,42}而是[^。；\n]{0,42}/u.test(content)
    || /归根到底/u.test(content)
    || /说到底/u.test(content);
}

function sanitizeMemorySignalLine(line = "") {
  const normalized = normalizeWhitespace(stripLeadingBulletMarker(line));
  if (!normalized) {
    return "";
  }

  if (!hasDurableMemorySignal(normalized)) {
    return "";
  }

  if (hasTransientValidationSignal(normalized)) {
    return "";
  }

  if (hasDogmaticMemoryPattern(normalized)) {
    return "";
  }

  return sanitizeBoundedText(normalized, 220);
}

function collectMemorySummaryLines(text = "", maxLines = 18) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => sanitizeMemorySignalLine(line))
    .filter(Boolean)
    .slice(0, maxLines);
}

function sanitizeMemorySummaryText(text = "", maxLines = 18) {
  const lines = collectMemorySummaryLines(text, maxLines);

  return normalizeWhitespace(lines.map((line) => `- ${line}`).join("\n"));
}

function mergeMemorySummaryTexts(existingSummary = "", newSummary = "", maxLines = 18) {
  const deduped = new Map();
  for (const line of [
    ...collectMemorySummaryLines(existingSummary, maxLines * 2),
    ...collectMemorySummaryLines(newSummary, maxLines * 2)
  ]) {
    const key = line.toLowerCase();
    if (deduped.has(key)) {
      deduped.delete(key);
    }
    deduped.set(key, line);
  }

  const lines = Array.from(deduped.values()).slice(-maxLines);
  return normalizeWhitespace(lines.map((line) => `- ${line}`).join("\n"));
}

function buildTrainedStyleSummaryFromPlaybook(playbook = {}) {
  return buildDistilledStyleSummaryFromPlaybook(playbook);
}

function buildUserMemorySummaryMessages({ existingSummary, chatLogs, memoryTurns }) {
  const recentChatSlice = chatLogs.map((record) => ({
    createdAt: record.createdAt,
    userMessages: Array.isArray(record.history)
      ? record.history
          .filter((item) => item?.role === "user")
          .map((item) => ({
            role: "user",
            content: normalizeWhitespace(item?.content || "")
          }))
          .filter((item) => item.content)
      : []
  }));
  const recentMemorySlice = memoryTurns.map((record) => ({
    createdAt: record.createdAt,
    user: {
      role: "user",
      content: normalizeWhitespace(record?.userMessage?.content || "")
    }
  }));

  return [
    {
      role: "system",
      content: [
        "You are maintaining a persistent user memory profile for a Hegel Salon.",
        "Summarize only durable, user-specific information that should survive across sessions.",
        "Prioritize: stable preferences, recurring topics, stated constraints, writing style requests, long-term projects, repeated unresolved questions, and verified user facts.",
        "Exclude one-off small talk, transient UI actions, and secrets.",
        "Write in concise Chinese bullet points without markdown headers."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Existing memory summary:\n${sanitizeMemorySummaryText(existingSummary) || "(none)"}`,
        "",
        "Recent persisted user messages:",
        JSON.stringify(recentChatSlice, null, 2),
        "",
        "Recent explicit user memory turns:",
        JSON.stringify(recentMemorySlice, null, 2),
        "",
        "Return the refreshed durable memory summary only.",
        "Keep only durable user preferences, recurring constraints, repeated project facts, and stable style requests.",
        "Do not echo assistant phrasing or summarize old assistant rhetoric as user preference."
      ].join("\n")
    }
  ];
}

function buildUserLongTermMemorySummaryMessages({ existingSummary, chatLogs, memoryTurns, styles }) {
  const recentChatSlice = chatLogs.map((record) => ({
    createdAt: record.createdAt,
    styleProfileId: record.styleProfileId,
    userMessages: Array.isArray(record.history)
      ? record.history
          .filter((item) => item?.role === "user")
          .map((item) => ({
            role: "user",
            content: normalizeWhitespace(item?.content || "")
          }))
          .filter((item) => item.content)
      : []
  }));
  const recentMemorySlice = memoryTurns.map((record) => ({
    createdAt: record.createdAt,
    styleProfileId: record.styleProfileId,
    user: {
      role: "user",
      content: normalizeWhitespace(record?.userMessage?.content || "")
    }
  }));

  return [
    {
      role: "system",
      content: [
        "You are maintaining a cross-style long-term memory profile for a Hegel Salon user.",
        "Summarize only durable, user-specific information that should survive across styles and sessions.",
        "Prioritize: stable preferences, recurring philosophical interests, recurring attachment workflows, long-term projects, repeated style constraints, and durable user facts.",
        "Exclude one-off UI actions, temporary drafts, and secrets.",
        "Write in concise Chinese bullet points without markdown headers."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Existing user-level long-term summary:\n${sanitizeMemorySummaryText(existingSummary) || "(none)"}`,
        "",
        `Current style keys: ${(Array.isArray(styles) ? styles : []).map((style) => style.styleKey).join(", ") || "(none)"}`,
        "",
        "Recent persisted user messages across styles:",
        JSON.stringify(recentChatSlice, null, 2),
        "",
        "Recent explicit user memory turns across styles:",
        JSON.stringify(recentMemorySlice, null, 2),
        "",
        "Return the refreshed durable user-level summary only.",
        "Keep only user-specific durable preferences and long-term constraints that should survive across styles.",
        "Do not treat assistant rhetoric, doctrinal slogans, or stock sentence patterns as user preference."
      ].join("\n")
    }
  ];
}

async function refreshUserMemoryProfile(scope = buildRuntimeScope(), config) {
  if (!scope.userId || !config?.apiKey || !config?.baseURL || !config?.model) {
    return null;
  }

  const existingProfile = readUserMemoryProfileFromDb(scope.userId, scope.styleProfileId);
  const [chatLogs, memoryTurns] = await Promise.all([
    Promise.resolve(readAllUserChatLogsFromDb(scope.userId, scope.styleProfileId)),
    Promise.resolve(readAllUserMemoryTurnsFromDb(scope.userId, scope.styleProfileId))
  ]);
  const sourceTurnCount = memoryTurns.length;

  if (sourceTurnCount === 0) {
    return null;
  }

  if (
    existingProfile &&
    existingProfile.sourceTurnCount === sourceTurnCount &&
    normalizeWhitespace(existingProfile.summaryText || "")
  ) {
    return existingProfile;
  }

  let summary = "";
  try {
    summary = normalizeWhitespace(
      await requestChatCompletion(
        config,
        buildUserMemorySummaryMessages({
          existingSummary: existingProfile?.summaryText || "",
          chatLogs,
          memoryTurns
        })
      )
    );
  } catch {
    summary = "";
  }
  const effectiveSummary = summary || buildUserHistoricalMemoryContextFromRecords(chatLogs, memoryTurns);

  return writeUserMemoryProfileToDb(
    scope.userId,
    scope.styleProfileId,
    effectiveSummary,
    sourceTurnCount,
    new Date().toISOString()
  );
}

async function refreshUserLongTermMemoryProfile(scope = buildRuntimeScope(), config) {
  if (!scope.userId) {
    return null;
  }

  if (!config?.apiKey || !config?.baseURL || !config?.model) {
    return null;
  }

  const existingProfile = readUserLongTermMemoryProfileFromDb(scope.userId);
  const [chatLogs, memoryTurns, styles] = await Promise.all([
    Promise.resolve(readAllUserChatLogsFromDb(scope.userId, null)),
    Promise.resolve(readAllUserMemoryTurnsFromDb(scope.userId, null)),
    Promise.resolve(listStyleProfilesByUserId(scope.userId))
  ]);
  const sourceTurnCount = chatLogs.length + memoryTurns.length;

  if (sourceTurnCount === 0) {
    return null;
  }

  if (
    existingProfile &&
    existingProfile.sourceTurnCount === sourceTurnCount &&
    normalizeWhitespace(existingProfile.summaryText || "")
  ) {
    return existingProfile;
  }

  let summary = "";
  try {
    summary = normalizeWhitespace(
      await requestChatCompletion(
        config,
        buildUserLongTermMemorySummaryMessages({
          existingSummary: existingProfile?.summaryText || "",
          chatLogs,
          memoryTurns,
          styles
        })
      )
    );
  } catch {
    summary = "";
  }
  const effectiveSummary = summary || buildUserHistoricalMemoryContextFromRecords(chatLogs, memoryTurns);

  return writeUserLongTermMemoryProfileToDb(
    scope.userId,
    effectiveSummary,
    sourceTurnCount,
    new Date().toISOString()
  );
}

async function refreshUserMemoryProfilesHeuristically(scope = buildRuntimeScope()) {
  if (!scope.userId) {
    return null;
  }

  try {
    const [
      styleChatLogs,
      styleMemoryTurns,
      userChatLogs,
      userMemoryTurns,
      existingStyleProfile,
      existingLongTermProfile
    ] = await Promise.all([
      Promise.resolve(readRecentUserChatLogsFromDb(scope.userId, scope.styleProfileId, MEMORY_HEURISTIC_CHAT_LIMIT)),
      Promise.resolve(readRecentUserMemoryTurnsFromDb(scope.userId, scope.styleProfileId, MEMORY_HEURISTIC_TURN_LIMIT)),
      Promise.resolve(readRecentUserChatLogsFromDb(scope.userId, null, MEMORY_HEURISTIC_CHAT_LIMIT)),
      Promise.resolve(readRecentUserMemoryTurnsFromDb(scope.userId, null, MEMORY_HEURISTIC_TURN_LIMIT)),
      Promise.resolve(readUserMemoryProfileFromDb(scope.userId, scope.styleProfileId)),
      Promise.resolve(readUserLongTermMemoryProfileFromDb(scope.userId))
    ]);

    const now = new Date().toISOString();
    const styleSummary = mergeMemorySummaryTexts(
      existingStyleProfile?.summaryText || "",
      buildUserHistoricalMemoryContextFromRecords(styleChatLogs, styleMemoryTurns),
      18
    );
    const longTermSummary = mergeMemorySummaryTexts(
      existingLongTermProfile?.summaryText || "",
      buildUserHistoricalMemoryContextFromRecords(userChatLogs, userMemoryTurns),
      22
    );

    const results = {
      styleMemoryProfile: existingStyleProfile || null,
      longTermMemoryProfile: existingLongTermProfile || null
    };

    if (styleSummary) {
      results.styleMemoryProfile = writeUserMemoryProfileToDb(
        scope.userId,
        scope.styleProfileId,
        styleSummary,
        countUserChatLogsInDb(scope.userId, scope.styleProfileId)
          + countUserMemoryTurnsInDb(scope.userId, scope.styleProfileId),
        now
      );
    }

    if (longTermSummary) {
      results.longTermMemoryProfile = writeUserLongTermMemoryProfileToDb(
        scope.userId,
        longTermSummary,
        countUserChatLogsInDb(scope.userId)
          + countUserMemoryTurnsInDb(scope.userId),
        now
      );
    }

    return results;
  } catch (error) {
    console.warn("Heuristic memory compression failed:", error?.message || error);
    return null;
  }
}

function refreshChatSessionMemoryProfileHeuristically(scope = buildRuntimeScope()) {
  if (!scope.userId || !scope.chatSessionId) {
    return null;
  }

  try {
    const sessionProfile = readChatSessionByIdFromDb(scope.userId, scope.chatSessionId);
    const knownMessageCount = Number(sessionProfile?.messageCount || 0);
    const sourceMessageCount = Number(sessionProfile?.memorySourceMessageCount || 0);
    const shouldRefresh =
      !sourceMessageCount ||
      knownMessageCount <= 200 ||
      knownMessageCount - sourceMessageCount >= 100 ||
      knownMessageCount % 1000 === 0;
    if (!shouldRefresh) {
      return sessionProfile;
    }

    const rows = readChatSessionMessagesFromDb(scope.userId, scope.chatSessionId);
    if (!rows.length) {
      return null;
    }

    const summary = buildUserHistoricalMemoryContextFromRecords(
      [{ history: rows, createdAt: rows[0]?.createdAt || "" }],
      []
    );
    if (!summary) {
      return null;
    }

    return writeChatSessionMemoryProfileToDb(
      scope.userId,
      scope.chatSessionId,
      summary,
      rows.length,
      new Date().toISOString()
    );
  } catch {
    return null;
  }
}

async function buildUserMemoryLayers(scope = buildRuntimeScope()) {
  if (!scope.userId) {
    return {
      styleProfile: null,
      styleMemoryProfile: null,
      longTermMemoryProfile: null,
      heuristicContext: "",
      blocks: []
    };
  }

  try {
    const styleProfile = readStyleProfileById(
      scope.userId,
      scope.styleProfileId || getDefaultStyleProfileId(scope.userId)
    );
    const styleMemoryProfile = readUserMemoryProfileFromDb(scope.userId, scope.styleProfileId);
    const longTermMemoryProfile = readUserLongTermMemoryProfileFromDb(scope.userId);
    const chatSessionProfile = scope.chatSessionId
      ? readChatSessionByIdFromDb(scope.userId, scope.chatSessionId)
      : null;
    const [chatLogs, memoryTurns] = await Promise.all([
      Promise.resolve(readRecentUserChatLogsFromDb(scope.userId, scope.styleProfileId, MEMORY_LAYER_CHAT_LIMIT)),
      Promise.resolve(readRecentUserMemoryTurnsFromDb(scope.userId, scope.styleProfileId, MEMORY_LAYER_TURN_LIMIT))
    ]);
    const heuristicContext = buildUserHistoricalMemoryContextFromRecords(chatLogs, memoryTurns);

    return {
      styleProfile,
      styleMemoryProfile,
      longTermMemoryProfile,
      heuristicContext,
      blocks: [
        buildPromptBlock("Current style base prompt", styleProfile?.userStylePrompt || ""),
        buildPromptBlock("Trained style summary", styleProfile?.trainedStyleSummary || ""),
        buildPromptBlock(
          "Style memory summary",
          sanitizeMemorySummaryText(styleMemoryProfile?.summaryText || "")
        ),
        buildPromptBlock(
          "User long-term memory summary",
          sanitizeMemorySummaryText(longTermMemoryProfile?.summaryText || "")
        ),
        buildPromptBlock(
          "Current chat session memory summary",
          sanitizeMemorySummaryText(chatSessionProfile?.memorySummaryText || "")
        ),
        buildPromptBlock("Cross-session style signals", heuristicContext || "")
      ].filter(Boolean)
    };
  } catch {
    return {
      styleProfile: null,
      styleMemoryProfile: null,
      longTermMemoryProfile: null,
      heuristicContext: "",
      blocks: []
    };
  }
}

async function buildUserHistoricalMemoryContext(scope = buildRuntimeScope()) {
  if (!scope.userId) {
    return "";
  }

  try {
    const layers = await buildUserMemoryLayers(scope);
    return layers.blocks.join("\n\n");
  } catch {
    return "";
  }
}

async function mergePersistedUserHistory(currentHistory, scope = buildRuntimeScope()) {
  const normalizedCurrent = normalizeHistoryInput(currentHistory);

  const persistedConversation = await readPersistedConversation(scope);
  if (!persistedConversation.length) {
    return normalizedCurrent;
  }

  return limitRecentHistory(
    mergeConversationHistoryWithoutDuplicate(persistedConversation, normalizedCurrent),
    CHAT_MODEL_HISTORY_LIMIT
  );
}

function messageFingerprintForMerge(message = {}) {
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map((attachment) => ({
        kind: attachment?.kind || "",
        name: attachment?.name || "",
        mediaType: attachment?.mediaType || "",
        fileId: attachment?.fileId || "",
        excerpt: attachment?.excerpt || "",
        imageUrl: attachment?.imageUrl || ""
      }))
    : [];

  return JSON.stringify({
    role: message?.role === "assistant" ? "assistant" : "user",
    content: normalizeWhitespace(message?.content || ""),
    attachments
  });
}

function mergeConversationHistoryWithoutDuplicate(persistedConversation = [], currentHistory = []) {
  const persisted = normalizeHistoryInput(persistedConversation);
  const current = normalizeHistoryInput(currentHistory);
  const maxOverlap = Math.min(persisted.length, current.length);
  let overlap = 0;

  for (let size = maxOverlap; size > 0; size -= 1) {
    let matches = true;
    for (let index = 0; index < size; index += 1) {
      const persistedItem = persisted[persisted.length - size + index];
      const currentItem = current[index];
      if (messageFingerprintForMerge(persistedItem) !== messageFingerprintForMerge(currentItem)) {
        matches = false;
        break;
      }
    }
    if (matches) {
      overlap = size;
      break;
    }
  }

  return [...persisted, ...current.slice(overlap)];
}

function looksLikeFollowUpRequest(currentHistory = []) {
  const latestUser = [...(Array.isArray(currentHistory) ? currentHistory : [])]
    .reverse()
    .find((message) => message?.role === "user");
  const content = normalizeWhitespace(latestUser?.content || "");
  if (!content) {
    return false;
  }

  return /继续|接着|上一条|上一个|刚才|刚刚|前面|上面|这个展开|详细说|再说|接下去|续写|follow[- ]?up|continue|elaborate/i.test(content);
}

function consumeSseLines(buffer, onPayload) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const rest = lines.pop() ?? "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) {
      continue;
    }

    const payload = line.slice(5).trim();
    if (!payload) {
      continue;
    }

    onPayload(payload);
  }

  return rest;
}

async function readSseChatCompletionText(response) {
  if (!response.body) {
    throw new Error("\u5728\u7ebf\u6a21\u578b\u6ca1\u6709\u8fd4\u56de\u53ef\u8bfb\u53d6\u7684\u6570\u636e\u6d41\u3002");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let reply = "";
  let sawDone = false;

  const acceptPayload = (payload) => {
    if (payload === "[DONE]") {
      sawDone = true;
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    if (parsed?.error?.message) {
      throw new Error(parsed.error.message);
    }

    reply += extractChunkText(parsed);
  };

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = consumeSseLines(buffer, acceptPayload);
    if (sawDone) {
      break;
    }
  }

  buffer += decoder.decode();
  if (!sawDone && buffer) {
    consumeSseLines(`${buffer}\n`, acceptPayload);
  }

  return reply.trim();
}

async function readUpstreamError(response) {
  const fallback = `\u5728\u7ebf\u6a21\u578b\u8bf7\u6c42\u5931\u8d25\uff08${response.status} ${response.statusText}\uff09\u3002`;

  try {
    const raw = (await response.text()).trim();
    if (!raw) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(raw);
      const detail =
        parsed?.error?.message ||
        parsed?.message ||
        parsed?.error ||
        parsed?.detail;
      if (typeof detail === "string" && detail.trim()) {
        return `\u5728\u7ebf\u6a21\u578b\u8bf7\u6c42\u5931\u8d25\uff08${response.status}\uff09\uff1a${detail.trim()}`;
      }
    } catch {
      return `\u5728\u7ebf\u6a21\u578b\u8bf7\u6c42\u5931\u8d25\uff08${response.status}\uff09\uff1a${raw.slice(0, 400)}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function finalizeSalonReply(text) {
  return tightenSalonCadence(
    rewriteTowardFirstPerson(sanitizeSalonReply(text))
  );
}

function requiresChinesePrimaryQuote(userPrompt, corpusContext) {
  const prompt = String(userPrompt || "");
  return (
    Boolean(corpusContext?.queryProfile?.preferChinesePrimary) &&
    ["\u539f\u53e5", "\u539f\u6587", "\u5f15\u7528", "\u5f15\u6587", "\u9010\u5b57", "\u4e2d\u6587"].some((term) => prompt.includes(term))
  );
}

function hasValidChineseQuote(validation) {
  return (validation?.validQuotedSegments || []).some((segment) =>
    /[\u4e00-\u9fff]/u.test(String(segment || ""))
  );
}

function hasValidLatinQuote(validation) {
  return (validation?.validQuotedSegments || []).some((segment) =>
    /[A-Za-z\u00c0-\u024f]/.test(String(segment || ""))
  );
}

function countLatinLetters(text) {
  return (String(text || "").match(/[A-Za-z\u00c0-\u024f]/g) || []).length;
}

function hasExcessiveLatinText(reply, allowMultilingual) {
  if (allowMultilingual) {
    return false;
  }

  return countLatinLetters(reply) >= 40;
}

function stripQuotedLatinSegments(text) {
  return String(text || "")
    .replace(/"([^"\n]*[A-Za-z\u00c0-\u024f][^"\n]*)"/g, "$1")
    .replace(/^\s*$/gm, "")
    .replace(/'([^'\n]*[A-Za-z\u00c0-\u024f][^'\n]*)'/g, "$1");
}

function requiresDialecticalArgument(userPrompt, corpusContext) {
  const prompt = String(userPrompt || "");
  if (corpusContext?.queryProfile?.queryLanguage !== "zh") {
    return false;
  }

  const triggers = [
    "\u4e3a\u4ec0\u4e48", "\u5982\u4f55", "\u4f55\u4ee5", "\u8bba\u8bc1", "\u89e3\u91ca", "\u6982\u5ff5", "\u5b9a\u4e49",
    "\u81ea\u7531", "\u610f\u5fd7", "\u5bf9\u8c61", "\u4e3b\u4f53", "\u5b9e\u4f53", "\u7cbe\u795e",
    "\u4f26\u7406", "\u6743\u5229", "\u6cd5", "\u56fd\u5bb6", "\u4efb\u6027", "\u6982\u5ff5\u8df3\u8dc3", "\u9690\u542b\u524d\u63d0"
  ];
  return triggers.some((term) => prompt.includes(term));
}

function needsExplicitRival(userPrompt) {
  const prompt = String(userPrompt || "");
  const triggers = [
    "\u5bf9\u7acb\u89c2\u70b9", "\u76f8\u53cd\u770b\u6cd5", "\u53e6\u4e00\u79cd\u770b\u6cd5", "\u522b\u7684\u7acb\u573a",
    "\u6bd4\u8f83", "\u533a\u522b"
  ];
  return triggers.some((term) => prompt.includes(term)) || /rival|alternative|contrast/i.test(prompt);
}

function needsExplicitObjection(userPrompt) {
  const prompt = String(userPrompt || "");
  const triggers = [
    "\u53cd\u5bf9", "\u5f02\u8bae", "\u653b\u51fb", "\u53cd\u9a73", "\u56de\u5e94", "\u4e3a\u4ec0\u4e48\u4e0d\u652f\u6301"
  ];
  return triggers.some((term) => prompt.includes(term)) || /objection|reply/i.test(prompt);
}

function isArgumentAuditRequest(userPrompt) {
  const prompt = String(userPrompt || "");
  const triggers = [
    "\u5f62\u5f0f\u903b\u8f91", "\u9690\u542b\u524d\u63d0", "\u6982\u5ff5\u8df3\u8dc3", "\u5077\u6362\u6982\u5ff5",
    "\u5faa\u73af\u8bba\u8bc1", "\u8bba\u8bc1\u529b\u5ea6", "A\u7248", "B\u7248", "\u4fee\u8ba2\u540e\u7684\u5b8c\u6574\u6587\u672c",
    "\u5173\u952e\u903b\u8f91\u4fee\u590d", "\u4e25\u683c\u533a\u5206", "\u5df2\u6838\u5bf9\u8fc7\u7684\u5f15\u6587",
    "\u57fa\u4e8e\u6587\u672c\u7684\u89e3\u91ca", "\u6211\u81ea\u5df1\u7684\u63a8\u8bba"
  ];
  return triggers.some((term) => prompt.includes(term));
}

function wantsAntiClicheAnswer(userPrompt) {
  const prompt = String(userPrompt || "");
  return (
    /不要.*套话/u.test(prompt) ||
    /不要.*教条/u.test(prompt) ||
    /不要.*流俗/u.test(prompt) ||
    /不要.*公共评论/u.test(prompt) ||
    /不要.*不是.*而是/u.test(prompt) ||
    /形式逻辑/u.test(prompt)
  );
}

function shouldMinimizeQuotes(userPrompt) {
  const prompt = String(userPrompt || "");
  return (
    wantsAntiClicheAnswer(prompt) ||
    /当代|现实政治|公共人物|领导人|执政者|民选领袖|中心人物/u.test(prompt)
  );
}

function isShortSubstantiveHegelPrompt(userPrompt) {
  const prompt = normalizeWhitespace(String(userPrompt || ""));
  if (!prompt || prompt.length > 140) {
    return false;
  }

  const substantiveShortSignals = [
    /(?:\u8c08\u8c08|\u8bf4\u8bf4|\u8bb2\u8bb2|\u804a\u804a|\u89e3\u91ca|\u600e\u4e48\u770b|\u4e3a\u4ec0\u4e48|\u4f55\u4ee5|\u662f\u4ec0\u4e48|\u5c31\u662f)/u,
    /(?:\u81ea\u7531|\u627f\u8ba4|\u8ba4\u53ef|\u4e3b\u5974|\u4e3b\u4eba|\u5974\u96b6|\u6b32\u671b|\u7cbe\u795e|\u4f26\u7406|\u56fd\u5bb6|\u610f\u5fd7|\u4e3b\u4f53|\u5b9e\u4f53|\u8fa9\u8bc1|\u5386\u53f2|\u653f\u6cbb|\u5b97\u6559|\u8d44\u672c|\u6b7b\u4ea1|\u7231)/u,
    /(?:\u6743\u529b|\u652f\u914d|\u670d\u4ece|\u65bd\u8650|\u53d7\u8650|\u8c03\u6559|\u75db\u82e6|\u8fb9\u754c|\u540c\u610f|\u6027|\u66b4\u529b|BDSM)/iu,
    /(?:^|\b)s\s*\/?\s*m(?:$|\b)/i
  ];
  return substantiveShortSignals.some((pattern) => pattern.test(prompt));
}

function isLightweightDirectAnswerRequest(userPrompt, history = []) {
  const prompt = normalizeWhitespace(String(userPrompt || ""));
  if (!prompt) {
    return false;
  }

  const shortPrompt = prompt.length <= 140;
  const shortHistory = Array.isArray(history) && history.length <= 4;
  const recentHistory = Array.isArray(history) && history.length <= 10;
  const operationalStatusSignals = [
    /(?:\u786e\u8ba4|\u5728\u7ebf|\u670d\u52a1|\u5f53\u524d)/u,
    /confirm|online|service|status|current/i
  ];
  if (
    shortPrompt &&
    shortHistory &&
    operationalStatusSignals.some((pattern) => pattern.test(prompt))
  ) {
    return true;
  }

  const directSignals = [
    /(?:\u4e00\u53e5\u8bdd|\u4e00\u53e5|\u7b80\u77ed|\u76f4\u63a5|\u53ea\u7528|\u786e\u8ba4|\u5728\u7ebf|\u5728\u5417|\u5728\u4e48|\u4f60\u597d|\u55e8|\u55ef|\u597d\u7684|\u8c22\u8c22|\u6982\u62ec|\u603b\u7ed3|\u6458\u8981)/u,
    /one sentence|brief|short|confirm|online|hello|summari[sz]e/i,
    /status|check-in|simple/i
  ];
  const clearlyDirect = directSignals.some((pattern) => pattern.test(prompt));

  const heavySignals = [
    /(?:\u4e3a\u4ec0\u4e48|\u5982\u4f55|\u4f55\u4ee5)/u,
    /(?:\u8bba\u8bc1|\u89e3\u91ca|\u6982\u5ff5|\u5b9a\u4e49|\u81ea\u7531|\u610f\u5fd7|\u4e3b\u4f53|\u5b9e\u4f53|\u7cbe\u795e|\u4f26\u7406|\u56fd\u5bb6|\u6cd5)/u,
    /(?:\u53cd\u9a73|\u5f02\u8bae|\u8fa9\u8bc1|\u5f62\u5f0f\u903b\u8f91|\u9690\u542b\u524d\u63d0|\u6982\u5ff5\u8df3\u8dc3|\u5386\u53f2|\u73b0\u5b9e\u653f\u6cbb)/u,
    /why|how|argue|justify|concept|dialectic|objection|reply|history|politic|formal logic|premise/i,
    /concept|definition|historical|political|argument|logic|quote|objection|reply/i
  ];
  if (heavySignals.some((pattern) => pattern.test(prompt))) {
    return false;
  }

  if (isShortSubstantiveHegelPrompt(prompt)) {
    return false;
  }

  return shortPrompt && shortHistory && clearlyDirect;
}

function hasDialecticalStructure(reply, userPrompt = "") {
  const text = normalizeWhitespace(String(reply || ""));
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const hasFirstPersonThesis = [
    "\u6211\u8ba4\u4e3a", "\u6211\u7684\u770b\u6cd5", "\u6211\u4e3b\u5f20", "\u5728\u6211\u770b\u6765"
  ].some((term) => text.includes(term)) || /I hold|My view is/i.test(text);
  const hasDefinitionCue = [
    "\u8fd9\u91cc\u7684", "\u6240\u8c13", "\u8fd9\u610f\u5473\u7740", "\u8fd9\u6982\u5ff5\u7684\u610f\u601d\u662f",
    "\u6211\u8fd9\u91cc\u8bf4\u7684", "\u5728\u8fd9\u91cc\u662f\u6307"
  ].some((term) => text.includes(term));
  const hasReasonCue = [
    "\u56e0\u4e3a", "\u56e0\u6b64", "\u6240\u4ee5", "\u7531\u6b64", "\u8fd9\u8868\u660e", "\u8fd9\u610f\u5473\u7740"
  ].some((term) => text.includes(term)) || /for this reason|therefore|thus/i.test(text);
  const hasRivalCue = [
    "\u53e6\u4e00\u79cd\u770b\u6cd5", "\u76f8\u53cd\u89c2\u70b9", "\u5982\u679c\u6709\u4eba\u8bf4", "\u6709\u4eba\u4f1a\u53cd\u5bf9", "\u53e6\u4e00\u7acb\u573a"
  ].some((term) => text.includes(term)) || /rival|alternative|contrast|objection/i.test(text);
  const hasReplyCue = [
    "\u4f46\u8fd9\u4e0d\u6210\u7acb", "\u8fd9\u4e2a\u53cd\u5bf9", "\u6211\u7684\u56de\u7b54\u662f", "\u6211\u56de\u5e94", "\u7136\u800c\u8fd9\u4e0d\u5bf9"
  ].some((term) => text.includes(term)) || /reply|response/i.test(text);
  const lowScaffoldPressure = estimateDogmaticScaffoldHits(text) <= 1;
  const rivalSatisfied = !needsExplicitRival(userPrompt) || hasRivalCue;
  const objectionSatisfied = !needsExplicitObjection(userPrompt) || hasReplyCue;

  return (
    paragraphs.length >= 4 &&
    hasFirstPersonThesis &&
    hasDefinitionCue &&
    hasReasonCue &&
    lowScaffoldPressure &&
    rivalSatisfied &&
    objectionSatisfied
  );
}

function countPattern(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

function estimateDogmaticScaffoldHits(reply) {
  const text = normalizeWhitespace(String(reply || ""));
  return (
    countPattern(text, /不是[^。；\n]{0,42}而是[^。；\n]{0,42}/g) +
    countPattern(text, /问题不在于[^。；\n]{0,42}而在于[^。；\n]{0,42}/g) +
    countPattern(text, /真正的[^。；\n]{0,24}不是[^。；\n]{0,42}而是[^。；\n]{0,42}/g) +
    countPattern(text, /这并不是说/g) +
    countPattern(text, /归根到底/g) +
    countPattern(text, /说到底/g)
  );
}

function buildQualityJudgeDefault() {
  return {
    overall: 8.5,
    anti_dogma: 8.5,
    formal_logic: 8.5,
    concept_precision: 8.5,
    argumentative_force: 8.5,
    expression_tightness: 8.5,
    question_fitness: 8.5,
    repeated_scaffold_hits: 0,
    has_dogmatic_repetition: false,
    needs_rewrite: false,
    issues: [],
    strengths: [],
    summary: ""
  };
}

function buildStrictLogicJudgeDefault() {
  return {
    formal_logic: 8.5,
    premise_visibility: 8.5,
    step_validity: 8.5,
    concept_stability: 8.5,
    no_large_leaps: 8.5,
    support_strength: 8.5,
    has_hidden_premise: false,
    has_concept_jump: false,
    has_equivocation: false,
    has_circularity: false,
    has_insufficient_support: false,
    passed_strict: true,
    issues: [],
    summary: ""
  };
}

function buildStrictLogicScaffoldDefault() {
  return {
    thesis: "",
    premises: [],
    inference_chain: [],
    objection: "",
    reply: "",
    conclusion: "",
    risky_terms: []
  };
}

function buildHistoriographyJudgeDefault() {
  return {
    overall: 8.5,
    chronology_discipline: 8.5,
    source_status_honesty: 8.5,
    authority_weighting: 8.5,
    analogy_limit: 8.5,
    anachronism_avoidance: 8.5,
    development_tracking: 8.5,
    institutional_specificity: 8.5,
    present_object_clarity: 8.5,
    has_anachronism: false,
    has_source_laundering: false,
    has_unbounded_analogy: false,
    has_flattened_development: false,
    has_presentism: false,
    passed_strict: true,
    issues: [],
    strengths: [],
    summary: ""
  };
}

function clampJudgeScore(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(10, Number(numeric.toFixed(1))));
}

function normalizeQualityJudgeRecord(record = {}, reply = "") {
  const heuristicHits = estimateDogmaticScaffoldHits(reply);
  const normalized = buildQualityJudgeDefault();

  normalized.overall = clampJudgeScore(record.overall ?? normalized.overall);
  normalized.anti_dogma = clampJudgeScore(record.anti_dogma ?? normalized.anti_dogma);
  normalized.formal_logic = clampJudgeScore(record.formal_logic ?? normalized.formal_logic);
  normalized.concept_precision = clampJudgeScore(
    record.concept_precision ?? normalized.concept_precision
  );
  normalized.argumentative_force = clampJudgeScore(
    record.argumentative_force ?? normalized.argumentative_force
  );
  normalized.expression_tightness = clampJudgeScore(
    record.expression_tightness ?? normalized.expression_tightness
  );
  normalized.question_fitness = clampJudgeScore(
    record.question_fitness ?? normalized.question_fitness
  );
  normalized.repeated_scaffold_hits = Math.max(
    Number.parseInt(record.repeated_scaffold_hits, 10) || 0,
    heuristicHits
  );
  normalized.has_dogmatic_repetition =
    Boolean(record.has_dogmatic_repetition) || normalized.repeated_scaffold_hits >= 2;
  normalized.needs_rewrite =
    Boolean(record.needs_rewrite) || normalized.has_dogmatic_repetition;
  normalized.issues = Array.isArray(record.issues)
    ? record.issues
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .slice(0, 8)
    : [];
  normalized.strengths = Array.isArray(record.strengths)
    ? record.strengths
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .slice(0, 5)
    : [];
  normalized.summary = typeof record.summary === "string" ? record.summary.trim() : "";

  if (normalized.has_dogmatic_repetition && !normalized.issues.length) {
    normalized.issues.push(
      "句式过度依赖固定教条骨架，尤其是反复使用“不是……而是……”这类公共评论式转折。"
    );
  }

  return normalized;
}

function normalizeStrictLogicJudgeRecord(record = {}) {
  const normalized = buildStrictLogicJudgeDefault();
  const numericFields = [
    "formal_logic",
    "premise_visibility",
    "step_validity",
    "concept_stability",
    "no_large_leaps",
    "support_strength"
  ];

  for (const field of numericFields) {
    normalized[field] = clampJudgeScore(record[field] ?? normalized[field]);
  }

  normalized.has_hidden_premise = Boolean(record.has_hidden_premise);
  normalized.has_concept_jump = Boolean(record.has_concept_jump);
  normalized.has_equivocation = Boolean(record.has_equivocation);
  normalized.has_circularity = Boolean(record.has_circularity);
  normalized.has_insufficient_support = Boolean(record.has_insufficient_support);
  normalized.passed_strict = Boolean(record.passed_strict);
  normalized.issues = Array.isArray(record.issues)
    ? record.issues
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .slice(0, 8)
    : [];
  normalized.summary = typeof record.summary === "string" ? record.summary.trim() : "";
  return normalized;
}

function normalizeStringList(value, limit = 8) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => normalizeWhitespace(item))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function normalizeStrictLogicScaffold(record = {}) {
  const normalized = buildStrictLogicScaffoldDefault();
  normalized.thesis = normalizeWhitespace(record.thesis || "");
  normalized.premises = normalizeStringList(record.premises, 6);
  normalized.inference_chain = normalizeStringList(record.inference_chain, 6);
  normalized.objection = normalizeWhitespace(record.objection || "");
  normalized.reply = normalizeWhitespace(record.reply || "");
  normalized.conclusion = normalizeWhitespace(record.conclusion || "");
  normalized.risky_terms = normalizeStringList(record.risky_terms, 8);
  return normalized;
}

function normalizeHistoriographyJudgeRecord(record = {}) {
  const normalized = buildHistoriographyJudgeDefault();
  const numericFields = [
    "overall",
    "chronology_discipline",
    "source_status_honesty",
    "authority_weighting",
    "analogy_limit",
    "anachronism_avoidance",
    "development_tracking",
    "institutional_specificity",
    "present_object_clarity"
  ];

  for (const field of numericFields) {
    normalized[field] = clampJudgeScore(record[field] ?? normalized[field]);
  }

  normalized.has_anachronism = Boolean(record.has_anachronism);
  normalized.has_source_laundering = Boolean(record.has_source_laundering);
  normalized.has_unbounded_analogy = Boolean(record.has_unbounded_analogy);
  normalized.has_flattened_development = Boolean(record.has_flattened_development);
  normalized.has_presentism = Boolean(record.has_presentism);
  normalized.passed_strict = Boolean(record.passed_strict);
  normalized.issues = Array.isArray(record.issues)
    ? record.issues
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .slice(0, 8)
    : [];
  normalized.strengths = Array.isArray(record.strengths)
    ? record.strengths
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .slice(0, 5)
    : [];
  normalized.summary = typeof record.summary === "string" ? record.summary.trim() : "";
  return normalized;
}

function hasUsableStrictLogicScaffold(scaffold) {
  return Boolean(
    scaffold?.thesis &&
      scaffold.premises?.length >= 3 &&
      scaffold.inference_chain?.length >= 2 &&
      scaffold.objection &&
      scaffold.reply &&
      scaffold.conclusion
  );
}

function renderStrictLogicScaffold(scaffold) {
  return [
    `Thesis: ${scaffold?.thesis || ""}`,
    "Premises:",
    ...(scaffold?.premises || []).map((item, index) => `${index + 1}. ${item}`),
    "Inference chain:",
    ...(scaffold?.inference_chain || []).map((item, index) => `${index + 1}. ${item}`),
    `Objection: ${scaffold?.objection || ""}`,
    `Reply: ${scaffold?.reply || ""}`,
    `Conclusion: ${scaffold?.conclusion || ""}`,
    (scaffold?.risky_terms || []).length
      ? `Risky terms: ${scaffold.risky_terms.join("; ")}`
      : "Risky terms:"
  ].join("\n");
}

function parseJudgeJson(rawText) {
  const raw = String(rawText || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end < start) {
    return {};
  }

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return {};
  }
}

function buildQualityJudgeMessages({
  systemPrompt,
  userPrompt,
  candidateReply,
  mustBeDialectical,
  argumentAuditMode
}) {
  return [
    {
      role: "system",
      content: [
        "You are a severe quality judge for a Chinese Hegel-style answer.",
        "Judge whether the answer avoids dogmatic cliché, avoids public-commentary boilerplate, and actually carries formal argumentative pressure.",
        "Return only one JSON object.",
        "Use a 0-10 scale for: overall, anti_dogma, formal_logic, concept_precision, argumentative_force, expression_tightness, question_fitness.",
        "Treat stock contrastive molds such as not-X-but-Y, 问题不在于A而在于B, 真正的X不是Y而是Z, 归根到底, and 说到底 as high-suspicion signals rather than as Hegelian strength.",
        "Set has_dogmatic_repetition to true if the answer leans on those molds more than once, or if one such mold does major structural work in place of real inference.",
        "Set needs_rewrite to true unless the answer would plausibly score around 95/100 or above in a strict internal review.",
        "Do not be lenient. If the answer sounds like doctrinal repetition, generic ideological prose, elegant fog, or a debate-coach reversal machine, punish it sharply.",
        mustBeDialectical
          ? "This answer must contain a real philosophical argument with explicit concepts, reasons, objection, and reply."
          : "This answer must still remain logically explicit and conceptually determinate.",
        argumentAuditMode
          ? "Because this is an audit/revision task, demand especially high premise visibility, step validity, and concept stability."
          : "Because this is a conceptual answer, demand strong argumentative movement rather than surface atmosphere."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "Question:",
        String(userPrompt || ""),
        "",
        "Candidate answer:",
        String(candidateReply || ""),
        "",
        "Return JSON with exactly these keys:",
        "overall, anti_dogma, formal_logic, concept_precision, argumentative_force, expression_tightness, question_fitness, repeated_scaffold_hits, has_dogmatic_repetition, needs_rewrite, issues, strengths, summary"
      ].join("\n")
    }
  ];
}

function buildStrictLogicJudgeMessages({ userPrompt, candidateReply }) {
  return [
    {
      role: "system",
      content: [
        "You are a severe formal-logic and anti-fallacy auditor.",
        "Return only one JSON object.",
        "If there is any hidden premise, concept jump, equivocation, circularity, or insufficient support, mark it.",
        "Be stricter than an ordinary philosophical reviewer."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "Audit the answer under a strict zero-fallacy standard.",
        "JSON keys:",
        "{",
        '  "formal_logic": 0.0-10.0,',
        '  "premise_visibility": 0.0-10.0,',
        '  "step_validity": 0.0-10.0,',
        '  "concept_stability": 0.0-10.0,',
        '  "no_large_leaps": 0.0-10.0,',
        '  "support_strength": 0.0-10.0,',
        '  "has_hidden_premise": true/false,',
        '  "has_concept_jump": true/false,',
        '  "has_equivocation": true/false,',
        '  "has_circularity": true/false,',
        '  "has_insufficient_support": true/false,',
        '  "passed_strict": true/false,',
        '  "summary": "一句话总结",',
        '  "issues": ["简短问题列表"]',
        "}",
        "",
        "Question:",
        String(userPrompt || ""),
        "",
        "Answer:",
        String(candidateReply || "")
      ].join("\n")
    }
  ];
}

function buildStrictLogicScaffoldMessages({
  systemPrompt,
  userPrompt,
  antiClicheMode,
  argumentAuditMode,
  minimizeQuotes
}) {
  return [
    {
      role: "system",
      content: [
        systemPrompt,
        "",
        "Before writing prose, build a strict logic scaffold.",
        "Return JSON only.",
        "Expose the thesis, explicit premises, inference chain, objection, reply, and conclusion.",
        "Do not write ornamental rhetoric.",
        "Do not hide premises inside elegant sentences.",
        antiClicheMode
          ? "The user explicitly forbids cliché and stock not-X-but-Y scaffolds. Avoid them at the scaffold level too."
          : "Keep the scaffold free of cliché.",
        minimizeQuotes
          ? "Do not include direct quotations in the scaffold unless one short quotation is absolutely necessary."
          : "Use quotations only if a precise wording is strictly load-bearing.",
        argumentAuditMode
          ? "Because this is an audit-style task, make each inferential step maximally explicit."
          : "Make the scaffold suitable for a later strict logical audit."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "Question:",
        String(userPrompt || ""),
        "",
        "Return JSON with exactly these keys:",
        "{",
        '  "thesis": "one-sentence thesis",',
        '  "premises": ["explicit premise 1", "explicit premise 2", "explicit premise 3"],',
        '  "inference_chain": ["step 1", "step 2"],',
        '  "objection": "one strong objection",',
        '  "reply": "reply to the objection",',
        '  "conclusion": "final judgment",',
        '  "risky_terms": ["term that could slide in meaning"]',
        "}"
      ].join("\n")
    }
  ];
}

function buildHistoriographyJudgeMessages({
  userPrompt,
  candidateReply,
  historicalContextText
}) {
  return [
    {
      role: "system",
      content: [
        "You are a severe historiography auditor for present-day judgments that use Hegelian history.",
        "Return only one JSON object.",
        "Be extremely strict about chronology, source-status honesty, authority weighting, anachronism avoidance, and analogy limits.",
        "If the answer smuggles in a historical analogy without marking its limit, punish it.",
        "If the answer treats lecture material as though it were automatically equivalent to lifetime publications, punish it.",
        "If the answer projects modern categories backward without warning, punish it."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "Audit the following answer under a strict historiographical standard for contemporary political or reality-oriented analysis.",
        "JSON keys:",
        "{",
        '  "overall": 0.0-10.0,',
        '  "chronology_discipline": 0.0-10.0,',
        '  "source_status_honesty": 0.0-10.0,',
        '  "authority_weighting": 0.0-10.0,',
        '  "analogy_limit": 0.0-10.0,',
        '  "anachronism_avoidance": 0.0-10.0,',
        '  "development_tracking": 0.0-10.0,',
        '  "institutional_specificity": 0.0-10.0,',
        '  "present_object_clarity": 0.0-10.0,',
        '  "has_anachronism": true/false,',
        '  "has_source_laundering": true/false,',
        '  "has_unbounded_analogy": true/false,',
        '  "has_flattened_development": true/false,',
        '  "has_presentism": true/false,',
        '  "passed_strict": true/false,',
        '  "summary": "一句话总结",',
        '  "issues": ["简短问题列表"],',
        '  "strengths": ["简短优点列表"]',
        "}",
        "",
        "Question:",
        String(userPrompt || ""),
        "",
        "Historical context recovered for this answer:",
        String(historicalContextText || ""),
        "",
        "Answer:",
        String(candidateReply || "")
      ].join("\n")
    }
  ];
}

function passesFormalQualityGate(judge) {
  if (!judge) {
    return true;
  }

  return (
    judge.overall >= 9.4 &&
    judge.anti_dogma >= 9.2 &&
    judge.formal_logic >= 9.2 &&
    judge.concept_precision >= 9.2 &&
    judge.argumentative_force >= 9.1 &&
    judge.expression_tightness >= 8.9 &&
    judge.question_fitness >= 9.2 &&
    judge.repeated_scaffold_hits < 2 &&
    !judge.has_dogmatic_repetition &&
    !judge.needs_rewrite
  );
}

function passesStrictLogicGate(judge) {
  if (!judge) {
    return true;
  }

  return (
    judge.passed_strict === true &&
    judge.has_hidden_premise !== true &&
    judge.has_concept_jump !== true &&
    judge.has_equivocation !== true &&
    judge.has_circularity !== true &&
    judge.has_insufficient_support !== true &&
    judge.formal_logic >= 9.9 &&
    judge.premise_visibility >= 9.9 &&
    judge.step_validity >= 9.9 &&
    judge.concept_stability >= 9.9 &&
    judge.no_large_leaps >= 9.9 &&
    judge.support_strength >= 9.9
  );
}

function passesHistoriographyGate(judge) {
  if (!judge) {
    return true;
  }

  return (
    judge.passed_strict === true &&
    judge.has_anachronism !== true &&
    judge.has_source_laundering !== true &&
    judge.has_unbounded_analogy !== true &&
    judge.has_flattened_development !== true &&
    judge.has_presentism !== true &&
    judge.overall >= 9.8 &&
    judge.chronology_discipline >= 9.8 &&
    judge.source_status_honesty >= 9.9 &&
    judge.authority_weighting >= 9.8 &&
    judge.analogy_limit >= 9.8 &&
    judge.anachronism_avoidance >= 9.9 &&
    judge.development_tracking >= 9.7 &&
    judge.institutional_specificity >= 9.7 &&
    judge.present_object_clarity >= 9.7
  );
}

function buildHeuristicQualityJudge(candidateReply, mustBeDialectical) {
  const repeatedScaffoldHits = estimateDogmaticScaffoldHits(candidateReply);
  const structureOkay = !mustBeDialectical || hasDialecticalStructure(candidateReply);
  const weak = repeatedScaffoldHits >= 3 || !structureOkay;

  return normalizeQualityJudgeRecord(
    {
      overall: weak ? 7.6 : 9.5,
      anti_dogma: repeatedScaffoldHits >= 3 ? 6.8 : 9.4,
      formal_logic: structureOkay ? 9.2 : 7.2,
      concept_precision: weak ? 8.1 : 9.3,
      argumentative_force: weak ? 7.8 : 9.2,
      expression_tightness: repeatedScaffoldHits >= 3 ? 7.4 : 9.0,
      question_fitness: weak ? 8.3 : 9.4,
      repeated_scaffold_hits: repeatedScaffoldHits,
      has_dogmatic_repetition: repeatedScaffoldHits >= 3,
      needs_rewrite: weak,
      issues: weak
        ? [
            repeatedScaffoldHits >= 3
              ? "重复使用教条式句法骨架，表达出现可替换的公共评论套路。"
              : "论证结构还不够显性，关键概念与理由链仍然偏松。"
          ]
        : [],
      strengths: weak ? [] : ["结构基本成立，且没有明显的教条化复读。"] ,
      summary: weak
        ? "上游质量判官不可用，已退回启发式评估；当前文本仍需压缩教条骨架并加强逻辑显性。"
        : "上游质量判官不可用，已退回启发式评估；当前文本未见明显的教条式复读。"
    },
    candidateReply
  );
}


async function requestChatCompletion(config, messages) {
  const response = await fetch(toApiUrl(config.baseURL, "chat/completions"), {
    method: "POST",
    signal: AbortSignal.timeout(upstreamChatTimeoutMs),
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      messages,
      model: config.model,
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(await readUpstreamError(response));
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    const html = await response.text();
    throw new Error(
      `Upstream returned HTML instead of model output. Check Base URL configuration (current: ${config.baseURL}). For OpenAI-compatible gateways, include /v1.`
    );
  }

  const text = await Promise.race([
    readSseChatCompletionText(response),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Chat completion timed out.")), upstreamChatTimeoutMs)
    )
  ]);

  if (!String(text || "").trim()) {
    throw new Error(
      `Upstream returned an empty response. Check Base URL configuration (current: ${config.baseURL}). For OpenAI-compatible gateways, include /v1.`
    );
  }

  return text;
}

async function requestResponseCompletion(client, config, instructions, history) {
  const response = await Promise.race([
    client.responses.create({
      model: config.model,
      instructions,
      input: buildResponseInput(history),
      tools: buildResponseTools(history)
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Responses completion timed out.")), upstreamResponsesTimeoutMs)
    )
  ]);

  const text = String(response.output_text || "").trim();
  if (!text) {
    throw new Error(
      `Upstream returned an empty response. Check Base URL configuration (current: ${config.baseURL}). For OpenAI-compatible gateways, include /v1.`
    );
  }
  return text;
}

async function requestFormalQualityJudge(config, {
  systemPrompt,
  userPrompt,
  candidateReply,
  mustBeDialectical,
  argumentAuditMode
}) {
  try {
    const raw = await requestChatCompletion(
      config,
      buildQualityJudgeMessages({
        systemPrompt,
        userPrompt,
        candidateReply,
        mustBeDialectical,
        argumentAuditMode
      })
    );

    return normalizeQualityJudgeRecord(parseJudgeJson(raw), candidateReply);
  } catch {
    return buildHeuristicQualityJudge(candidateReply, mustBeDialectical);
  }
}

async function requestStrictLogicJudge(config, { userPrompt, candidateReply }) {
  try {
    const raw = await requestChatCompletion(
      config,
      buildStrictLogicJudgeMessages({ userPrompt, candidateReply })
    );
    return normalizeStrictLogicJudgeRecord(parseJudgeJson(raw));
  } catch {
    return normalizeStrictLogicJudgeRecord({
      formal_logic: 7.5,
      premise_visibility: 7.5,
      step_validity: 7.5,
      concept_stability: 7.5,
      no_large_leaps: 7.5,
      support_strength: 7.5,
      has_hidden_premise: true,
      has_concept_jump: true,
      has_equivocation: false,
      has_circularity: false,
      has_insufficient_support: true,
      passed_strict: false,
      issues: [
        "严格形式逻辑判官不可用，因此不能把当前答案视为零谬误通过。"
      ],
      summary: "严格形式逻辑判官不可用，按 fail-closed 处理。"
    });
  }
}

async function requestHistoriographyJudge(
  config,
  { userPrompt, candidateReply, historicalContextText }
) {
  try {
    const raw = await requestChatCompletion(
      config,
      buildHistoriographyJudgeMessages({
        userPrompt,
        candidateReply,
        historicalContextText
      })
    );
    return normalizeHistoriographyJudgeRecord(parseJudgeJson(raw));
  } catch {
    return normalizeHistoriographyJudgeRecord({
      overall: 7.0,
      chronology_discipline: 7.0,
      source_status_honesty: 7.0,
      authority_weighting: 7.0,
      analogy_limit: 7.0,
      anachronism_avoidance: 7.0,
      development_tracking: 7.0,
      institutional_specificity: 7.0,
      present_object_clarity: 7.0,
      has_anachronism: true,
      has_source_laundering: true,
      has_unbounded_analogy: true,
      has_flattened_development: true,
      has_presentism: true,
      passed_strict: false,
      issues: [
        "严格史学判官不可用，因此不能把当前现实判断视为严格史学合格。"
      ],
      summary: "严格史学判官不可用，按 fail-closed 处理。"
    });
  }
}

async function requestStrictLogicScaffold(
  config,
  { systemPrompt, userPrompt, antiClicheMode, argumentAuditMode, minimizeQuotes }
) {
  const raw = await requestChatCompletion(
    config,
    buildStrictLogicScaffoldMessages({
      systemPrompt,
      userPrompt,
      antiClicheMode,
      argumentAuditMode,
      minimizeQuotes
    })
  );

  return normalizeStrictLogicScaffold(parseJudgeJson(raw));
}

async function buildApprovedStrictLogicScaffold(
  config,
  { systemPrompt, userPrompt, antiClicheMode, argumentAuditMode, minimizeQuotes }
) {
  let bestScaffold = buildStrictLogicScaffoldDefault();
  let bestJudge = buildStrictLogicJudgeDefault();

  let messages = buildStrictLogicScaffoldMessages({
    systemPrompt,
    userPrompt,
    antiClicheMode,
    argumentAuditMode,
    minimizeQuotes
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const raw = await requestChatCompletion(config, messages);
    const scaffold = normalizeStrictLogicScaffold(parseJudgeJson(raw));
    const scaffoldText = renderStrictLogicScaffold(scaffold);
    const judge = await requestStrictLogicJudge(config, {
      userPrompt,
      candidateReply: scaffoldText
    });

    bestScaffold = scaffold;
    bestJudge = judge;

    if (hasUsableStrictLogicScaffold(scaffold) && passesStrictLogicGate(judge)) {
      return { scaffold, judge, attempts: attempt + 1, passed: true };
    }

    const revisionLines = [
      "Revise the scaffold.",
      "Make all premises explicit.",
      "Do not leave any concept jump or semantic slide unresolved.",
      `Strict summary: ${judge.summary || "The scaffold still has a logical gap."}`
    ];

    if (!hasUsableStrictLogicScaffold(scaffold)) {
      revisionLines.push(
        "The scaffold is structurally incomplete. It must contain thesis, at least three premises, at least two inferential steps, objection, reply, and conclusion."
      );
    }

    if (judge.issues?.length) {
      revisionLines.push(
        "Repair these logic defects:",
        ...judge.issues.map((issue) => `- ${issue}`)
      );
    }

    messages = [
      ...messages,
      { role: "assistant", content: raw, attachments: [] },
      { role: "user", content: revisionLines.join("\n"), attachments: [] }
    ];
  }

  return {
    scaffold: bestScaffold,
    judge: bestJudge,
    attempts: 3,
    passed: false
  };
}

function createFallbackRunner(primaryConfig, fallbackConfig = null) {
  let activeConfig = primaryConfig;
  let client = null;

  return {
    getActiveConfig() {
      return activeConfig;
    },
    getClient() {
      return client;
    },
    ensureClient(config = activeConfig) {
      activeConfig = config;
      client = createOpenAIClient(activeConfig);
      return client;
    },
    async run(task) {
      try {
        return await task(client, activeConfig);
      } catch (error) {
        if (
          !fallbackConfig ||
          activeConfig.baseURL === fallbackConfig.baseURL ||
          !isEndpointNotFoundError(error)
        ) {
          throw error;
        }

        activeConfig = fallbackConfig;
        client = createOpenAIClient(activeConfig);
        return task(client, activeConfig);
      }
    }
  };
}

function buildQuerySpecificInstructionLines({
  corpusContext,
  optimizerContext,
  attachmentMode,
  multilingualRequested,
  mustUseChineseQuote,
  mustBeDialectical,
  argumentAuditMode,
  antiClicheMode,
  minimizeQuotes,
  mustPreferChineseQuotes
}) {
  return [
    "You must treat the following retrieved corpus evidence as mandatory working material for this answer whenever it is relevant.",
    "Do not mention internal retrieval mechanics.",
    "If retrieved passages are relevant, let the answer be shaped by them rather than by generalized memory.",
    "Never quote or near-quote summary-level wording from ledgers, audits, or other prompt-pack summaries as if that wording itself came from Hegel.",
    "Only wording that appears literally in the retrieved corpus evidence or in the aligned citation bank may be used as quotation wording.",
    "If the pack supports only the doctrine and not the exact phrase, present the point as interpretation or summary rather than as quotation.",
    "Do not lead by announcing a verdict and only afterward attaching reasons.",
    "Build the answer in order: determine the concepts, justify them from the text, answer at least one objection, then conclude.",
    "Do not manufacture a false dilemma, an artificial opposition, or a ritual first-negation-then-affirm move.",
    "If the text already supplies a positive determination, begin from that determination instead of forcing a negation first.",
    "Prefer movement by determination, limit, transition, and consequence: for example, if, once, so long as, from here, therefore, only thus.",
    "Do not use neat contrastive reversals as the default sentence engine. A single such turn may be tolerated, but it must not organize the answer.",
    "Only introduce a nearby rival view when the user's question or the retrieved passage itself makes that rival determinately relevant.",
    "If answering in Chinese, do not leak unexplained English filler or trailing English sentences into the prose.",
    antiClicheMode
      ? "The user explicitly banned cliché, doctrinal repetition, and stock not-X-but-Y scaffolds. Treat that as a hard constraint. Use that scaffold zero times unless the wording would otherwise become less exact."
      : "Avoid cliché and doctrinal repetition.",
    antiClicheMode
      ? "Do not let the answer drift into essayistic atmosphere or public-commentary rhetoric. Every paragraph must carry a distinct inferential task."
      : "Keep the prose conceptually disciplined.",
    mustBeDialectical
      ? "For this query, a real philosophical argument is mandatory. Do not merely assert or paraphrase. Say in the first person what your view is, explain the concepts, justify the definitions, answer an objection, and show why your position is stronger."
      : "Keep the answer analytically serious rather than atmospheric.",
    corpusContext?.queryProfile?.preferChinesePrimary
      ? "For this query, checked Chinese wording is the primary wording layer. Use it before English or German unless the user explicitly asked for comparison."
      : "For this query, use the strongest retrieved wording layer honestly and do not invent a Chinese original where none was checked.",
    corpusContext?.chinese?.primaryEdition?.editionLabel
      ? `Current Chinese edition line: ${corpusContext.chinese.primaryEdition.editionLabel}. Stay faithful to its wording in the main answer.`
      : "No single checked Chinese edition line has been selected yet for this answer.",
    argumentAuditMode
      ? "This is an argument-audit or revision request. Check whether each step follows, expose hidden premises and concept-jumps, distinguish checked quotation from interpretation and inference, compress harder than in an ordinary conceptual answer, remove repeated formulations, and keep internal workflow commentary out of the repaired prose. If the user asked for A版 and B版, provide exactly those two parts in plain text."
      : "This is not an explicit argument-audit request. Do not drift into audit-style metacommentary unless the user explicitly asked for revision.",
    mustPreferChineseQuotes
      ? "When a direct quotation is needed for this query, quote the checked Chinese wording rather than the English line whenever Chinese wording is available."
      : "When quotation wording is needed, use the strongest available verified wording layer honestly.",
    minimizeQuotes
      ? "For this query, direct quotation should be minimal. Use no quotation unless it is genuinely load-bearing for the inference."
      : "Use quotation only when it actually strengthens the argument.",
    "For substantive conceptual answers, make the reasoning explicit: define the key concepts, explain why you define them that way, answer at least one objection, and tie each major step to quoted evidence where possible.",
    "For substantive Hegel answers, explicitly separate four layers in substance: primary-text evidence, interpretive paraphrase, modern extension when present, and system-generated summary.",
    corpusContext?.dialecticalPlan
      ? "Use the [DIALECTICAL PLAN] block as the logical skeleton for this turn."
      : "Use a determinate conceptual skeleton rather than Hegelian atmosphere.",
    corpusContext?.modeRoute?.mode
      ? `Current mode router result: ${corpusContext.modeRoute.mode}. Follow its forbidden behavior and required answer layers.`
      : "No mode route was supplied.",
    multilingualRequested
      ? "The user explicitly asked for multilingual comparison when relevant. Keep all languages tied to the same work and locator."
      : "Do not default to trilingual display unless a wording dispute requires it.",
    attachmentMode
      ? "The user attached files or images. Prioritize understanding those attachments and answering the concrete request about them. Keep the reply in a Hegelian first-person cadence by default, preferably in Chinese unless the user asked otherwise. Do not force quote policing or corpus-only behavior when the attachment itself is the main object, but do preserve conceptual pressure, explicit determinations, and the voice of Hegel rather than a generic assistant."
      : "No user attachments were supplied for this turn.",
    optimizerContext || "Optimization memory inactive.",
    mustUseChineseQuote
      ? "At least one exact checked Chinese quotation is required when direct quotation is used."
      : ""
  ].filter(Boolean);
}

async function prepareHegelQueryState(history, uploadedFiles = [], options = {}) {
  const scope = options.scope || buildRuntimeScope();
  const userId = scope.userId || null;
  const config = await resolveEffectiveApiConfig(scope);
  const optimizerMode = Boolean(options?.optimizerMode);
  const fastPublicChatMode = publicChatFastMode && !optimizerMode;

  if (!config.apiKey) {
    throw new Error(
      scope.userId
        ? "当前用户尚未配置 API key。请先在前端的 API 配置里填写。"
        : "未能从 Codex 配置读取可用的 API key。"
    );
  }

  if (!config.model) {
    throw new Error(
      scope.userId
        ? "当前用户尚未配置模型名称。请先在前端的 API 配置里填写。"
        : "未能从本地配置读取可用的模型名称。"
    );
  }

  if (!config.baseURL) {
    throw new Error(
      scope.userId
        ? "当前用户尚未配置 Base URL。请先在前端的 API 配置里填写。"
        : "未能从 Codex 配置读取在线模型的 base URL。"
    );
  }

  const fallbackConfig = scope.userId ? null : getResponsesFallbackConfig(config);
  const runner = createFallbackRunner(config, fallbackConfig);

  return runQueryLoop(
    {
      scope,
      userId,
      config,
      fallbackConfig,
      runner,
      optimizerMode,
      uploadedFiles,
      normalizedHistory: normalizeHistoryInput(history),
      latestUserIndex: findLatestUserMessageIndex(normalizeHistoryInput(history))
    },
    [
      {
        name: "integrate_uploads",
        run: async (state) => {
          if (state.latestUserIndex === -1) {
            throw new Error("请先提供一个有效的问题。");
          }

          if (!state.uploadedFiles.length) {
            return {};
          }

          state.runner.ensureClient(state.fallbackConfig || state.config);
          const uploadedAttachments = await state.runner.run((activeClient) =>
            uploadAttachments(activeClient, state.uploadedFiles, state.scope)
          );
          const existingPersisted = getMessageAttachments(
            state.normalizedHistory[state.latestUserIndex]
          ).filter((attachment) => attachment.fileId);

          const nextHistory = [...state.normalizedHistory];
          nextHistory[state.latestUserIndex] = {
            ...nextHistory[state.latestUserIndex],
            attachments: [...existingPersisted, ...uploadedAttachments]
          };

          return {
            normalizedHistory: nextHistory
          };
        }
      },
      {
        name: "ensure_payload",
        run: async (state) => {
          const latestUserIndex = findLatestUserMessageIndex(state.normalizedHistory);
          if (latestUserIndex === -1) {
            throw new Error("请先提供一个有效的问题。");
          }

          if (!hasMessagePayload(state.normalizedHistory[latestUserIndex])) {
            throw new Error("请先提供文字或附件再提问。");
          }

          return {
            latestUserIndex
          };
        }
      },
      {
        name: "merge_persisted_history",
        run: async (state) => {
          const mergedHistory = await mergePersistedUserHistory(state.normalizedHistory, state.scope);
          return {
            normalizedHistory: mergedHistory,
            latestUserIndex: findLatestUserMessageIndex(mergedHistory)
          };
        }
      },
      {
        name: "derive_context_modes",
        run: async (state) => {
          const latestUser = state.normalizedHistory[state.latestUserIndex];
          const hasImageAttachmentContext = state.normalizedHistory.some((message) =>
            getMessageAttachments(message).some(
              (attachment) => attachment.kind === "image" && attachment.imageUrl
            )
          );
          const hasRemoteAttachmentContext = state.normalizedHistory.some((message) =>
            getMessageAttachments(message).some((attachment) => attachment.fileId)
          );
          const hasLocalAttachmentContext = state.normalizedHistory.some((message) =>
            getMessageAttachments(message).some(attachmentHasLocalText)
          );
          const hasAttachmentContext =
            hasImageAttachmentContext || hasRemoteAttachmentContext || hasLocalAttachmentContext;

          if (hasRemoteAttachmentContext && !state.runner.getClient()) {
            state.runner.ensureClient(state.fallbackConfig || state.config);
          }

          return {
            latestUser,
            hasImageAttachmentContext,
            hasRemoteAttachmentContext,
            hasLocalAttachmentContext,
            hasAttachmentContext,
            attachmentMode: hasAttachmentContext,
            multilingualRequested: [
              "中英德", "三语", "德文", "英文"
            ].some((term) => String(latestUser?.content || "").includes(term)) ||
              /German|English|trilingual/i.test(String(latestUser?.content || ""))
          };
        }
      },
      {
        name: "build_context_layers",
        run: async (state) => {
          const corpusContext = await buildCorpusContext(state.latestUser?.content || "");
          const userMemoryLayers = await buildUserMemoryLayers(state.scope);
          const optimizerContext = await buildOptimizerMemoryContext(
            state.latestUser?.content || "",
            state.userId,
            state.scope.styleProfileId
          );
          const compactedConversation = compactConversationHistoryForPrompt(
            state.normalizedHistory,
            {
              keepRecent: state.attachmentMode
                ? PROMPT_ATTACHMENT_RECENT_MESSAGE_LIMIT
                : PROMPT_RECENT_MESSAGE_LIMIT,
              maxRecentChars: state.attachmentMode
                ? PROMPT_ATTACHMENT_RECENT_CHAR_BUDGET
                : PROMPT_RECENT_CHAR_BUDGET,
              maxMessageChars: state.attachmentMode
                ? PROMPT_ATTACHMENT_MAX_MESSAGE_CHARS
                : PROMPT_MAX_MESSAGE_CHARS,
              maxSummaryChars: PROMPT_SUMMARY_CHAR_BUDGET
            }
          );
          const attachmentSummary = buildAttachmentExtractionSummary(state.normalizedHistory);

          return {
            corpusContext,
            userMemoryLayers,
            optimizerContext,
            compactedConversation,
            attachmentSummary,
            mustUseChineseQuote: !state.attachmentMode && requiresChinesePrimaryQuote(
              state.latestUser?.content || "",
              corpusContext
            ),
            mustBeDialectical: !state.attachmentMode && requiresDialecticalArgument(
              state.latestUser?.content || "",
              corpusContext
            ),
            argumentAuditMode: !state.attachmentMode && isArgumentAuditRequest(state.latestUser?.content || ""),
            antiClicheMode: !state.attachmentMode && wantsAntiClicheAnswer(state.latestUser?.content || ""),
            minimizeQuotes: !state.attachmentMode && shouldMinimizeQuotes(state.latestUser?.content || ""),
            mustPreferChineseQuotes:
              !state.attachmentMode &&
              !state.multilingualRequested &&
              Boolean(corpusContext?.queryProfile?.preferChinesePrimary)
          };
        }
      },
      {
        name: "assemble_prompt",
        run: async (state) => {
          const staticPromptBlocks = buildHegelStaticPromptBlocks();
          await persistResearchSnapshot(staticPromptBlocks.join("\n"));

          const dynamicBlocks = [
            buildPromptBlock(
              "Query-specific instructions",
              buildQuerySpecificInstructionLines({
                corpusContext: state.corpusContext,
                optimizerContext: state.optimizerContext,
                attachmentMode: state.attachmentMode,
                multilingualRequested: state.multilingualRequested,
                mustUseChineseQuote: state.mustUseChineseQuote,
                mustBeDialectical: state.mustBeDialectical,
                argumentAuditMode: state.argumentAuditMode,
                antiClicheMode: state.antiClicheMode,
                minimizeQuotes: state.minimizeQuotes,
                mustPreferChineseQuotes: state.mustPreferChineseQuotes
              }).join("\n")
            ),
            buildPromptBlock(
              "Current session compressed summary",
              state.compactedConversation.summaryText
            ),
            buildPromptBlock("Attachment extraction summary", state.attachmentSummary),
            ...(state.userMemoryLayers?.blocks || []),
            buildPromptBlock("Retrieved corpus evidence", state.corpusContext?.contextText || "")
          ].filter(Boolean);

          return {
            systemPrompt: joinPromptBlocks(staticPromptBlocks, dynamicBlocks),
            messages: state.compactedConversation.recentMessages.map((message) => ({
              role: message.role,
              content: message.content,
              attachments: Array.isArray(message.attachments)
                ? message.attachments.map((attachment) => ({ ...attachment }))
                : []
            }))
          };
        }
      }
    ]
  );
}

async function requestOnlineHegelReply(history, uploadedFiles = [], options = {}) {
  const scope = options.scope || buildRuntimeScope();
  const userId = scope.userId || null;
  const config = await resolveEffectiveApiConfig(scope);
  const optimizerMode = Boolean(options?.optimizerMode);
  const fastPublicChatMode = publicChatFastMode && !optimizerMode;

  if (!config.apiKey) {
    throw new Error(
      scope.userId
        ? "当前用户尚未配置 API key。请先在前端的 API 配置里填写。"
        : "\u672a\u80fd\u4ece Codex \u914d\u7f6e\u8bfb\u53d6\u53ef\u7528\u7684 API key\u3002"
    );
  }

  if (!config.model) {
    throw new Error(
      scope.userId
        ? "当前用户尚未配置模型名称。请先在前端的 API 配置里填写。"
        : "未能从本地配置读取可用的模型名称。"
    );
  }

  if (!config.baseURL) {
    throw new Error(
      scope.userId
        ? "当前用户尚未配置 Base URL。请先在前端的 API 配置里填写。"
        : "\u672a\u80fd\u4ece Codex \u914d\u7f6e\u8bfb\u53d6\u5728\u7ebf\u6a21\u578b\u7684 base URL\u3002"
    );
  }

  const fallbackConfig = scope.userId ? null : getResponsesFallbackConfig(config);
  let activeConfig = config;
  let client = null;
  let normalizedHistory = publicChatFastMode
    ? limitRecentHistory(history, CHAT_MODEL_HISTORY_LIMIT)
    : normalizeHistoryInput(history);
  let latestUserIndex = findLatestUserMessageIndex(normalizedHistory);

  if (latestUserIndex === -1) {
    throw new Error("\u8bf7\u5148\u63d0\u4f9b\u4e00\u4e2a\u6709\u6548\u7684\u95ee\u9898\u3002");
  }

  async function withPossibleFallback(task, { ensureClient = false } = {}) {
    try {
      if (ensureClient && !client) {
        client = createOpenAIClient(activeConfig);
      }
      return await task(client, activeConfig);
    } catch (error) {
      if (
        !fallbackConfig ||
        activeConfig.baseURL === fallbackConfig.baseURL ||
        !isEndpointNotFoundError(error)
      ) {
        throw error;
      }

      activeConfig = fallbackConfig;
      client = createOpenAIClient(activeConfig);
      return task(client, activeConfig);
    }
  }

  if (uploadedFiles.length) {
    activeConfig = fallbackConfig || config;
    client = createOpenAIClient(activeConfig);
    const uploadedAttachments = await withPossibleFallback((activeClient) =>
      uploadAttachments(activeClient, uploadedFiles, scope)
    );
    const existingPersisted = getMessageAttachments(normalizedHistory[latestUserIndex]).filter(
      (attachment) => attachment.fileId
    );

    normalizedHistory[latestUserIndex] = {
      ...normalizedHistory[latestUserIndex],
      attachments: [...existingPersisted, ...uploadedAttachments]
    };
  }

  if (!hasMessagePayload(normalizedHistory[latestUserIndex])) {
    throw new Error("\u8bf7\u5148\u63d0\u4f9b\u6587\u5b57\u6216\u9644\u4ef6\u518d\u63d0\u95ee\u3002");
  }

  const recentRecallReply = buildRecentQuestionRecallReply(normalizedHistory, latestUserIndex);
  if (recentRecallReply) {
    return {
      reply: recentRecallReply,
      validation: {
        quotedSegments: [],
        candidateSegments: [],
        validQuotedSegments: [],
        invalidQuotedSegments: [],
        passed: true
      },
      qualityJudge: buildQualityJudgeDefault(),
      strictLogicJudge: buildStrictLogicJudgeDefault(),
      historiographyJudge: buildHistoriographyJudgeDefault(),
      strictLogicScaffold: null,
      usedConfig: config,
      attempts: 0,
      history: normalizedHistory,
      userMessage: normalizedHistory[latestUserIndex]
    };
  }

  const durableMemoryRecallReply = buildDurableMemoryRecallReply(normalizedHistory, latestUserIndex, scope);
  if (durableMemoryRecallReply) {
    return {
      reply: durableMemoryRecallReply,
      validation: {
        quotedSegments: [],
        candidateSegments: [],
        validQuotedSegments: [],
        invalidQuotedSegments: [],
        passed: true
      },
      qualityJudge: buildQualityJudgeDefault(),
      strictLogicJudge: buildStrictLogicJudgeDefault(),
      historiographyJudge: buildHistoriographyJudgeDefault(),
      strictLogicScaffold: null,
      usedConfig: config,
      attempts: 0,
      history: normalizedHistory,
      userMessage: normalizedHistory[latestUserIndex]
    };
  }

  const lightweightDirectInputMode =
    !optimizerMode &&
    isLightweightDirectAnswerRequest(
      normalizedHistory[latestUserIndex]?.content || "",
      normalizedHistory
    );

  normalizedHistory = optimizerMode
    ? normalizedHistory
    : await mergePersistedUserHistory(normalizedHistory, scope);
  if (publicChatFastMode) {
    normalizedHistory = limitRecentHistory(normalizedHistory, CHAT_MODEL_HISTORY_LIMIT);
  }
  latestUserIndex = findLatestUserMessageIndex(normalizedHistory);

  const hasImageAttachmentContext = normalizedHistory.some((message) =>
    getMessageAttachments(message).some(
      (attachment) => attachment.kind === "image" && attachment.imageUrl
    )
  );
  const hasRemoteAttachmentContext = normalizedHistory.some((message) =>
    getMessageAttachments(message).some((attachment) => attachment.fileId)
  );
  const hasLocalAttachmentContext = normalizedHistory.some((message) =>
    getMessageAttachments(message).some(attachmentHasLocalText)
  );
  const hasAttachmentContext =
    hasImageAttachmentContext || hasRemoteAttachmentContext || hasLocalAttachmentContext;

  if (hasRemoteAttachmentContext && !client) {
    activeConfig = fallbackConfig || config;
    client = createOpenAIClient(activeConfig);
  }

  const staticPromptBlocks = buildHegelStaticPromptBlocks();
  await persistResearchSnapshot(staticPromptBlocks.join("\n"));
  const systemPrompt = staticPromptBlocks.join("\n");
  const latestUser = normalizedHistory[latestUserIndex];
  const lightweightDirectMode =
    !hasAttachmentContext && lightweightDirectInputMode;

  if (lightweightDirectMode) {
    const userMemoryLayers = await buildUserMemoryLayers(scope);
    const condensedUserMemory = [
      sanitizeMemorySummaryText(userMemoryLayers?.styleMemoryProfile?.summaryText || "", 8),
      sanitizeMemorySummaryText(userMemoryLayers?.longTermMemoryProfile?.summaryText || "", 8),
      sanitizeBoundedText(userMemoryLayers?.heuristicContext || "", 1200)
    ].filter(Boolean).join("\n");
    const lightweightSystemPrompt = joinPromptBlocks([], [
      buildPromptBlock(
        "Lightweight direct-answer mode",
        [
          "You are Hegel Salon in lightweight direct-answer mode.",
          "Use this mode only for greetings, status checks, memory recalls, or explicitly simple operational requests.",
          "Answer in Chinese unless the user explicitly requested another language.",
          "Never say a short fragment lacks context, and never ask the user to add another sentence before answering.",
          "If a fragment reaches this mode, treat it as a valid topic and give a provisional conceptual answer.",
          "For provocative, adult, or power-related topics, stay non-graphic and reason through relation, boundary, consent, recognition, or freedom.",
          "Keep it concise but substantial, usually 2-4 sentences; one sentence is only for pure greetings or status confirmations.",
          "Do not expand into historical digressions, quote policing, memory summaries, or multi-paragraph scaffolds.",
          "Keep the wording clear, calm, and conceptually explicit."
        ].join("\n")
      ),
      buildPromptBlock(
        "Current style base prompt",
        sanitizeBoundedText(userMemoryLayers?.styleProfile?.userStylePrompt || "", 180)
      ),
      buildPromptBlock(
        "Trained style summary",
        sanitizeBoundedText(userMemoryLayers?.styleProfile?.trainedStyleSummary || "", 220)
      ),
      buildPromptBlock(
        "Condensed user memory for grounding",
        condensedUserMemory
      )
    ]);
    const lightweightMessages = [
      {
        role: "user",
        content: latestUser?.content || "",
        attachments: []
      }
    ];
    let lightweightRawReply = "";
    if (publicChatFastMode) {
      lightweightRawReply = await requestChatCompletion(
        activeConfig,
        buildChatCompletionMessages(lightweightSystemPrompt, lightweightMessages)
      );
    } else {
      try {
        lightweightRawReply = await withPossibleFallback(
          (activeClient, currentConfig) =>
            requestResponseCompletion(
              activeClient,
              currentConfig,
              lightweightSystemPrompt,
              lightweightMessages
            ),
          { ensureClient: true }
        );
      } catch {
        lightweightRawReply = await requestChatCompletion(
          activeConfig,
          buildChatCompletionMessages(lightweightSystemPrompt, lightweightMessages)
        );
      }
    }
    const reply = finalizeSalonReply(lightweightRawReply);

    return {
      reply,
      validation: {
        quotedSegments: [],
        candidateSegments: [],
        validQuotedSegments: [],
        invalidQuotedSegments: [],
        passed: true
      },
      qualityJudge: buildQualityJudgeDefault(),
      strictLogicJudge: buildStrictLogicJudgeDefault(),
      historiographyJudge: buildHistoriographyJudgeDefault(),
      strictLogicScaffold: null,
      usedConfig: activeConfig,
      attempts: 1,
      history: normalizedHistory,
      userMessage: normalizedHistory[latestUserIndex]
    };
  }

  if (optimizerMode && !hasAttachmentContext) {
    const optimizerContext = await buildOptimizerMemoryContext(
      latestUser?.content || "",
      userId,
      scope.styleProfileId
    );
    const optimizerSystemPrompt = joinPromptBlocks([], [
      buildPromptBlock(
        "Optimizer training answer mode",
        [
          "You are Hegel Salon answering a training prompt for quality optimization.",
          "Answer in Chinese unless the prompt explicitly asks otherwise.",
          "Do not ask for more context. Treat each training prompt as complete.",
          "Give a direct, evaluable answer: first state the thesis, then expose the key premises, then address one serious objection.",
          "Prefer explicit reasoning over atmosphere, slogans, or ornamental Hegelian prose.",
          "Keep the answer compact enough for automated judging: usually 3-6 paragraphs.",
          "If the prompt asks for formal-logic repair, separate hidden premise, concept jump, corrected argument, and remaining limit.",
          "If the prompt asks about history or reality, mark analogy boundaries and source-status limits honestly."
        ].join("\n")
      ),
      buildPromptBlock(
        "Current optimizer memory",
        sanitizeBoundedText(optimizerContext || "", 1800)
      )
    ]);
    const optimizerMessages = [
      {
        role: "user",
        content: latestUser?.content || "",
        attachments: []
      }
    ];
    const optimizerRawReply = await requestChatCompletion(
      activeConfig,
      buildChatCompletionMessages(optimizerSystemPrompt, optimizerMessages)
    );
    const reply = finalizeSalonReply(optimizerRawReply);
    if (!reply) {
      throw new Error("Optimizer training mode returned an empty reply.");
    }

    return {
      reply,
      validation: {
        quotedSegments: [],
        candidateSegments: [],
        validQuotedSegments: [],
        invalidQuotedSegments: [],
        passed: true
      },
      qualityJudge: buildQualityJudgeDefault(),
      strictLogicJudge: buildStrictLogicJudgeDefault(),
      historiographyJudge: buildHistoriographyJudgeDefault(),
      strictLogicScaffold: null,
      usedConfig: activeConfig,
      attempts: 1,
      history: normalizedHistory,
      userMessage: normalizedHistory[latestUserIndex],
      modeRoute: {
        mode: "optimizer_training_answer",
        reason: "background training prompt"
      }
    };
  }

  const compactDialecticalMode =
    publicChatFastMode &&
    !hasAttachmentContext &&
    !optimizerMode &&
    isShortSubstantiveHegelPrompt(latestUser?.content || "");

  if (compactDialecticalMode) {
    const userMemoryLayers = await buildUserMemoryLayers(scope);
    const condensedUserMemory = [
      sanitizeMemorySummaryText(userMemoryLayers?.styleMemoryProfile?.summaryText || "", 6),
      sanitizeMemorySummaryText(userMemoryLayers?.longTermMemoryProfile?.summaryText || "", 6),
      sanitizeBoundedText(userMemoryLayers?.heuristicContext || "", 800)
    ].filter(Boolean).join("\n");
    const compactSystemPrompt = joinPromptBlocks([], [
      buildPromptBlock(
        "Compact dialectical short-topic mode",
        [
          "You are Hegel Salon answering a short but substantive user prompt.",
          "The user may send a fragment such as '自由', '就是承认', or '谈谈 sm'. Treat the fragment as a valid topic, not as missing context.",
          "Never say the prompt lacks context, never ask the user to add another sentence before you answer, and never echo a generic fallback template.",
          "Answer in Chinese unless the user explicitly requested another language.",
          "Give a concise but real Hegelian answer: determine the relation, name the contradiction or dependency, and end with a usable judgment.",
          "For adult, SM/BDSM, violence, pain, or power topics, stay non-graphic and analyze consent, boundary, reversibility, recognition, and freedom.",
          "Do not quote-police, do not provide long historical scaffolding, and do not apologize for brevity.",
          "Target 2-4 compact paragraphs or 3-6 sentences."
        ].join("\n")
      ),
      buildPromptBlock(
        "Current style base prompt",
        sanitizeBoundedText(userMemoryLayers?.styleProfile?.userStylePrompt || "", 180)
      ),
      buildPromptBlock(
        "Trained style summary",
        sanitizeBoundedText(userMemoryLayers?.styleProfile?.trainedStyleSummary || "", 220)
      ),
      buildPromptBlock(
        "Condensed user memory for grounding",
        condensedUserMemory
      )
    ]);
    const compactMessages = [
      {
        role: "user",
        content: latestUser?.content || "",
        attachments: []
      }
    ];
    const compactRawReply = await requestChatCompletion(
      activeConfig,
      buildChatCompletionMessages(compactSystemPrompt, compactMessages)
    );
    const reply = finalizeSalonReply(compactRawReply) || buildPublicFallbackReply(latestUser);

    return {
      reply,
      validation: {
        quotedSegments: [],
        candidateSegments: [],
        validQuotedSegments: [],
        invalidQuotedSegments: [],
        passed: true
      },
      qualityJudge: buildQualityJudgeDefault(),
      strictLogicJudge: buildStrictLogicJudgeDefault(),
      historiographyJudge: buildHistoriographyJudgeDefault(),
      strictLogicScaffold: null,
      usedConfig: activeConfig,
      attempts: 1,
      history: normalizedHistory,
      userMessage: normalizedHistory[latestUserIndex],
      modeRoute: {
        mode: "compact_dialectical_short",
        reason: "short substantive public prompt"
      }
    };
  }

  const corpusContext = await buildCorpusContext(latestUser?.content || "");
  const userMemoryLayers = await buildUserMemoryLayers(scope);
  const userHistoricalMemoryContext = userMemoryLayers?.blocks?.join("\n\n") || "";
  const optimizerContext = await buildOptimizerMemoryContext(
    latestUser?.content || "",
    userId,
    scope.styleProfileId
  );
  const attachmentMode = hasAttachmentContext;
  const multilingualRequested = [
    "\u4e2d\u82f1\u5fb7", "\u4e09\u8bed", "\u5fb7\u6587", "\u82f1\u6587"
  ].some((term) => String(latestUser?.content || "").includes(term)) || /German|English|trilingual/i.test(String(latestUser?.content || ""));
  const mustUseChineseQuote = !attachmentMode && requiresChinesePrimaryQuote(
    latestUser?.content || "",
    corpusContext
  );
  const mustBeDialectical = !attachmentMode && requiresDialecticalArgument(
    latestUser?.content || "",
    corpusContext
  );
  const argumentAuditMode = !attachmentMode && isArgumentAuditRequest(latestUser?.content || "");
  const antiClicheMode = !attachmentMode && wantsAntiClicheAnswer(latestUser?.content || "");
  const minimizeQuotes = !attachmentMode && shouldMinimizeQuotes(latestUser?.content || "");
  const mustPreferChineseQuotes =
    !attachmentMode &&
    !multilingualRequested &&
    Boolean(corpusContext?.queryProfile?.preferChinesePrimary);
  let augmentedSystemPrompt = [
    systemPrompt,
    "",
    "You must treat the following retrieved corpus evidence as mandatory working material for this answer whenever it is relevant.",
    "Do not mention internal retrieval mechanics.",
    "If retrieved passages are relevant, let the answer be shaped by them rather than by generalized memory.",
    "Never quote or near-quote summary-level wording from ledgers, audits, or other prompt-pack summaries as if that wording itself came from Hegel.",
    "Only wording that appears literally in the retrieved corpus evidence or in the aligned citation bank may be used as quotation wording.",
    "If the pack supports only the doctrine and not the exact phrase, present the point as interpretation or summary rather than as quotation.",
    "Do not lead by announcing a verdict and only afterward attaching reasons.",
    "Build the answer in order: determine the concepts, justify them from the text, answer at least one objection, then conclude.",
    "Do not manufacture a false dilemma, an artificial opposition, or a ritual first-negation-then-affirm move.",
    "If the text already supplies a positive determination, begin from that determination instead of forcing a negation first.",
    "Only introduce a nearby rival view when the user's question or the retrieved passage itself makes that rival determinately relevant.",
    "If answering in Chinese, do not leak unexplained English filler or trailing English sentences into the prose.",
    antiClicheMode
      ? "The user explicitly banned cliché, doctrinal repetition, and stock not-X-but-Y scaffolds. Treat that as a hard constraint. Use that scaffold at most once, preferably zero times."
      : "Avoid cliché and doctrinal repetition.",
    antiClicheMode
      ? "Do not let the answer drift into essayistic atmosphere or public-commentary rhetoric. Every paragraph must carry a distinct inferential task."
      : "Keep the prose conceptually disciplined.",
    mustBeDialectical
      ? "For this query, a real philosophical argument is mandatory. Do not merely assert or paraphrase. Say in the first person what your view is, explain the concepts, justify the definitions, answer an objection, and show why your position is stronger."
      : "Keep the answer analytically serious rather than atmospheric.",
    corpusContext?.queryProfile?.preferChinesePrimary
      ? "For this query, checked Chinese wording is the primary wording layer. Use it before English or German unless the user explicitly asked for comparison."
      : "For this query, use the strongest retrieved wording layer honestly and do not invent a Chinese original where none was checked.",
    corpusContext?.chinese?.primaryEdition?.editionLabel
      ? `Current Chinese edition line: ${corpusContext.chinese.primaryEdition.editionLabel}. Stay faithful to its wording in the main answer.`
      : "No single checked Chinese edition line has been selected yet for this answer.",
    argumentAuditMode
      ? "This is an argument-audit or revision request. Check whether each step follows, expose hidden premises and concept-jumps, distinguish checked quotation from interpretation and inference, compress harder than in an ordinary conceptual answer, remove repeated formulations, and keep internal workflow commentary out of the repaired prose. If the user asked for A\u7248 and B\u7248, provide exactly those two parts in plain text."
      : "This is not an explicit argument-audit request. Do not drift into audit-style metacommentary unless the user explicitly asked for revision.",
    mustPreferChineseQuotes
      ? "When a direct quotation is needed for this query, quote the checked Chinese wording rather than the English line whenever Chinese wording is available."
      : "When quotation wording is needed, use the strongest available verified wording layer honestly.",
    minimizeQuotes
      ? "For this query, direct quotation should be minimal. Use no quotation unless it is genuinely load-bearing for the inference."
      : "Use quotation only when it actually strengthens the argument.",
    "For substantive conceptual answers, make the reasoning explicit: define the key concepts, explain why you define them that way, answer at least one objection, and tie each major step to quoted evidence where possible.",
    multilingualRequested
      ? "The user explicitly asked for multilingual comparison when relevant. Keep all languages tied to the same work and locator."
      : "Do not default to trilingual display unless a wording dispute requires it.",
    attachmentMode
      ? "The user attached files or images. Prioritize understanding those attachments and answering the concrete request about them. Keep the reply in a Hegelian first-person cadence by default, preferably in Chinese unless the user asked otherwise. Do not force quote policing or corpus-only behavior when the attachment itself is the main object, but do preserve conceptual pressure, explicit determinations, and the voice of Hegel rather than a generic assistant."
      : "No user attachments were supplied for this turn.",
    optimizerContext || "Optimization memory inactive.",
    "",
    corpusContext.contextText
  ].join("\n");
  if (userHistoricalMemoryContext) {
    augmentedSystemPrompt = [
      augmentedSystemPrompt,
      "",
      "Cross-session user historical memory:",
      userHistoricalMemoryContext
    ].join("\n");
  }
  let strictLogicScaffold = null;
  const compactedConversation = compactConversationHistoryForPrompt(normalizedHistory, {
    keepRecent: attachmentMode
      ? PROMPT_ATTACHMENT_RECENT_MESSAGE_LIMIT
      : PROMPT_RECENT_MESSAGE_LIMIT,
    maxRecentChars: attachmentMode
      ? PROMPT_ATTACHMENT_RECENT_CHAR_BUDGET
      : PROMPT_RECENT_CHAR_BUDGET,
    maxMessageChars: attachmentMode
      ? PROMPT_ATTACHMENT_MAX_MESSAGE_CHARS
      : PROMPT_MAX_MESSAGE_CHARS,
    maxSummaryChars: PROMPT_SUMMARY_CHAR_BUDGET
  });
  const attachmentSummary = buildAttachmentExtractionSummary(normalizedHistory);
  augmentedSystemPrompt = joinPromptBlocks(staticPromptBlocks, [
    buildPromptBlock(
      "Query-specific instructions",
      buildQuerySpecificInstructionLines({
        corpusContext,
        optimizerContext,
        attachmentMode,
        multilingualRequested,
        mustUseChineseQuote,
        mustBeDialectical,
        argumentAuditMode,
        antiClicheMode,
        minimizeQuotes,
        mustPreferChineseQuotes
      }).join("\n")
    ),
    buildPromptBlock("Current session compressed summary", compactedConversation.summaryText),
    buildPromptBlock("Attachment extraction summary", attachmentSummary),
    ...(userMemoryLayers?.blocks || []),
    buildPromptBlock("Retrieved corpus evidence", corpusContext.contextText)
  ]);
  let messages = compactedConversation.recentMessages.map((message) => ({
    role: message.role,
    content: message.content,
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map((attachment) => ({ ...attachment }))
      : []
  }));
  let reply = "";
  let validation = {
    quotedSegments: [],
    candidateSegments: [],
    validQuotedSegments: [],
    invalidQuotedSegments: [],
    passed: true
  };
  let qualityJudge = buildQualityJudgeDefault();
  let strictLogicJudge = buildStrictLogicJudgeDefault();
  let historiographyJudge = buildHistoriographyJudgeDefault();
  let selfAudit = {
    passed: true,
    severity: "none",
    warnings: [],
    blocking_warnings: [],
    nonblocking_warnings: [],
    coverage_score: 10,
    conceptual_integrity_score: 10,
    required_revision_instructions: [],
    advisory_revision_instructions: []
  };
  let selfAuditBlockingRevisionCount = 0;
  let attempts = 0;
  const qualityGateEnabled =
    !attachmentMode && !optimizerMode && !lightweightDirectMode && !fastPublicChatMode;
  const strictLogicMode =
    !attachmentMode && !optimizerMode && !lightweightDirectMode && !fastPublicChatMode;
  const historiographyMode =
    !attachmentMode &&
    !optimizerMode &&
    !lightweightDirectMode &&
    !fastPublicChatMode &&
    Boolean(corpusContext?.historical?.enabled);

  if (strictLogicMode) {
    const scaffoldBundle = await buildApprovedStrictLogicScaffold(config, {
      systemPrompt: augmentedSystemPrompt,
      userPrompt: latestUser?.content || "",
      antiClicheMode,
      argumentAuditMode,
      minimizeQuotes
    });

    if (!scaffoldBundle) {
      return {
        reply: [
          "我不把这次答案交付为正式回答，因为在进入正文之前，论证骨架本身就没有通过严格形式逻辑认证。",
          "在这种情况下，我宁可停在这里，也不把带着隐含前提和概念跳跃的骨架继续扩写成成文答案。"
        ].join("\n\n"),
        validation,
        qualityJudge,
        strictLogicJudge: {
          ...buildStrictLogicJudgeDefault(),
          passed_strict: false,
          has_hidden_premise: true,
          has_concept_jump: true,
          has_insufficient_support: true,
          issues: [
            "论证骨架在进入正文之前就未通过严格形式逻辑认证。"
          ],
          summary: "逻辑骨架未通过严格认证。"
        },
        historiographyJudge,
        usedConfig: activeConfig,
        attempts,
        history: normalizedHistory,
        userMessage: normalizedHistory[latestUserIndex]
      };
    }

    strictLogicScaffold = scaffoldBundle.scaffold;
    augmentedSystemPrompt = [
      augmentedSystemPrompt,
      "",
      "Approved strict logic scaffold:",
      renderStrictLogicScaffold(strictLogicScaffold),
      "",
      "You may not introduce any new inferential step unless you state it as an added premise and defend it immediately.",
      "Every paragraph must follow the approved scaffold rather than free-associate."
    ].join("\n");
  }

  while (attempts < 3) {
    attempts += 1;
      reply = finalizeSalonReply(
        hasImageAttachmentContext
          ? await requestChatCompletion(
              config,
              buildChatCompletionMessages(augmentedSystemPrompt, messages)
            )
          : hasRemoteAttachmentContext || lightweightDirectMode
          ? await withPossibleFallback((activeClient, currentConfig) =>
              requestResponseCompletion(activeClient, currentConfig, augmentedSystemPrompt, messages)
            , { ensureClient: true })
          : await requestChatCompletion(
              config,
              buildChatCompletionMessages(augmentedSystemPrompt, messages)
            )
    );

    if (!reply) {
      throw new Error("\u5728\u7ebf\u6a21\u578b\u8fd4\u56de\u4e86\u7a7a\u767d\u5185\u5bb9\u3002");
    }

    if (attachmentMode) {
      return {
        reply,
        validation,
        usedConfig: activeConfig,
        attempts,
        history: normalizedHistory,
        userMessage: normalizedHistory[latestUserIndex]
      };
    }

    validation = validateReplyQuotes(reply, corpusContext);
    const chineseQuoteSatisfied = !mustUseChineseQuote || hasValidChineseQuote(validation);
    const chineseQuotePrioritySatisfied =
      !mustPreferChineseQuotes ||
      !hasValidChineseQuote(validation) ||
      !hasValidLatinQuote(validation);
    const languageSatisfied = !hasExcessiveLatinText(reply, multilingualRequested);
    const structureSatisfied =
      !mustBeDialectical || hasDialecticalStructure(reply, latestUser?.content || "");
    qualityJudge = qualityGateEnabled
      ? await requestFormalQualityJudge(config, {
          systemPrompt: augmentedSystemPrompt,
          userPrompt: latestUser?.content || "",
          candidateReply: reply,
          mustBeDialectical,
          argumentAuditMode
        })
      : buildQualityJudgeDefault();
    strictLogicJudge = strictLogicMode
      ? await requestStrictLogicJudge(config, {
          userPrompt: latestUser?.content || "",
          candidateReply: reply
        })
      : buildStrictLogicJudgeDefault();
    historiographyJudge = historiographyMode
      ? await requestHistoriographyJudge(config, {
          userPrompt: latestUser?.content || "",
          candidateReply: reply,
          historicalContextText: corpusContext?.historical?.contextText || ""
        })
      : buildHistoriographyJudgeDefault();
    selfAudit = auditHegelReply({
      reply,
      userMessage: latestUser?.content || "",
      corpusContext,
      conceptContext: corpusContext?.conceptGraphContext,
      dialecticalPlan: corpusContext?.dialecticalPlan,
      modeRoute: corpusContext?.modeRoute,
      quoteValidation: validation
    });
    const qualitySatisfied = !qualityGateEnabled || passesFormalQualityGate(qualityJudge);
    const strictLogicSatisfied = !strictLogicMode || passesStrictLogicGate(strictLogicJudge);
    const historiographySatisfied =
      !historiographyMode || passesHistoriographyGate(historiographyJudge);
    const selfAuditSatisfied = selfAudit.passed;
    if (
      validation.passed &&
      chineseQuoteSatisfied &&
      chineseQuotePrioritySatisfied &&
      languageSatisfied &&
      structureSatisfied &&
      qualitySatisfied &&
      strictLogicSatisfied &&
      historiographySatisfied &&
      selfAuditSatisfied
    ) {
      return {
        reply,
        validation,
        qualityJudge,
        strictLogicJudge,
        historiographyJudge,
        selfAudit,
        modeRoute: corpusContext?.modeRoute,
        conceptGraphContext: corpusContext?.conceptGraphContext
          ? {
              concept_domains: corpusContext.conceptGraphContext.concept_domains || [],
              risk_level: corpusContext.conceptGraphContext.risk_level || "none",
              detected_concepts: (corpusContext.conceptGraphContext.detected_concepts || []).map((item) => ({
                id: item.id,
                domain: item.domain,
                risk_level: item.risk_level,
                score: item.score
              }))
            }
          : null,
        sourceAnchors: corpusContext?.sourceAnchors || [],
        strictLogicScaffold,
        attempts,
        history: normalizedHistory,
        userMessage: normalizedHistory[latestUserIndex]
      };
    }

    if (attempts >= 3) {
      break;
    }

    const revisionLines = ["Revise the previous answer."];

    if (validation.invalidQuotedSegments.length) {
      const invalidList = validation.invalidQuotedSegments
        .map((segment) => `- "${segment}"`)
        .join("\n");

      revisionLines.push(
        "The following quoted snippets were not found literally in the retrieved evidence for this answer:",
        invalidList,
        "Replace them with exact wording from the retrieved evidence, or remove the quotation marks and present them only as interpretation."
      );
    }

    if (mustUseChineseQuote && !hasValidChineseQuote(validation)) {
      revisionLines.push(
        "This query requires at least one exact checked Chinese quotation from the loaded Chinese evidence.",
        "Use the checked Chinese wording literally, place it in quotation marks, and build the argument from that wording."
      );
    }

    if (mustPreferChineseQuotes && hasValidChineseQuote(validation) && hasValidLatinQuote(validation)) {
      revisionLines.push(
        "Because this is a Chinese-primary query with checked Chinese wording loaded, direct quotations should be Chinese rather than English.",
        "Remove the English quoted lines or convert them into unquoted support while keeping the checked Chinese quotation as the direct wording."
      );
    }

    if (!languageSatisfied) {
      revisionLines.push(
        "Keep the prose fully in Chinese unless the user explicitly requested multilingual display.",
        "Remove stray English filler, isolated English terms, and trailing English sentences."
      );
    }

    if (mustBeDialectical && !structureSatisfied) {
      revisionLines.push(
        "This answer is still too close to assertion or paraphrase.",
        "Rewrite it as a philosophical argument in the first person.",
        "Include these moves in plain paragraphs: my view, what each key concept means here, why I define it this way, one objection, and my reply to that objection.",
        "Only introduce a rival view if the user explicitly asked for comparison or attack."
      );
    }

    if (qualityGateEnabled && !passesFormalQualityGate(qualityJudge)) {
      revisionLines.push(
        "The answer still fails a strict quality gate aimed at roughly 95/100 internal quality.",
        `Judge summary: ${qualityJudge.summary || "The prose remains too dogmatic or formally weak."}`
      );

      if (qualityJudge.issues.length) {
        revisionLines.push(
          "Fix these concrete issues:",
          ...qualityJudge.issues.map((issue) => `- ${issue}`)
        );
      }

      if (qualityJudge.has_dogmatic_repetition || qualityJudge.repeated_scaffold_hits >= 2) {
        revisionLines.push(
          "Break the stock scaffolds.",
          "Do not keep repeating public-commentary turns such as “不是……而是……”, “问题不在于……而在于……”, or sermon-like universal statements.",
          "Replace them with determinate premises, explicit inferential links, fresh conceptual definitions, and transitions such as if, once, so long as, therefore, and from here."
        );
      }

      revisionLines.push(
        "Raise formal logic, concept precision, and expression tightness together.",
        "Compress empty abstractions, expose hidden premises, and let every paragraph carry a distinct inferential task."
      );
    }

    if (strictLogicMode && !passesStrictLogicGate(strictLogicJudge)) {
      revisionLines.push(
        "The answer still fails a zero-fallacy formal logic audit.",
        `Strict summary: ${strictLogicJudge.summary || "The inferential chain still contains a formal weakness."}`
      );

      if (strictLogicJudge.issues.length) {
        revisionLines.push(
          "Repair these strict formal logic issues:",
          ...strictLogicJudge.issues.map((issue) => `- ${issue}`)
        );
      }

      revisionLines.push(
        "Expose every hidden premise explicitly.",
        "Remove any concept jump, equivocation, circular move, or unsupported leap.",
        "If a step cannot be defended, delete it rather than decorate it."
      );
    }

    if (historiographyMode && !passesHistoriographyGate(historiographyJudge)) {
      revisionLines.push(
        "The answer still fails a strict historiography audit for present-day judgment.",
        `Historiography summary: ${historiographyJudge.summary || "The historical framing is still too loose."}`
      );

      if (historiographyJudge.issues.length) {
        revisionLines.push(
          "Repair these historiographical defects:",
          ...historiographyJudge.issues.map((issue) => `- ${issue}`)
        );
      }

      revisionLines.push(
        "State the historical form more precisely.",
        "Mark the limit of every analogy explicitly.",
        "Keep source-status honesty visible whenever you lean on a historical witness.",
        "Do not flatten early writings, mature system texts, and lecture transmissions into one undifferentiated authority level.",
        "Do not project present-day categories backward unless you explicitly mark the projection."
      );
    }

    if (!selfAudit.passed) {
      revisionLines.push(
        "The answer failed the blocking tier of the Hegel concept-system self-audit.",
        "High-risk self-audit failures must be repaired before delivery; low and medium warnings are advisory and may be recorded without blocking."
      );

      if (selfAudit.blocking_warnings?.length) {
        revisionLines.push(
          "Blocking self-audit warnings:",
          ...selfAudit.blocking_warnings.map((item) => `- ${item.code}: ${item.message}`)
        );
      }

      if (selfAudit.required_revision_instructions.length) {
        revisionLines.push(
          "Required self-audit revisions:",
          ...selfAudit.required_revision_instructions.map((instruction) => `- ${instruction}`)
        );
      }

      selfAuditBlockingRevisionCount += 1;
    }

    revisionLines.push(
      "Keep the answer in Chinese and preserve only verified quotation wording."
    );

    messages = [
      ...messages,
      { role: "assistant", content: reply, attachments: [] },
      {
        role: "user",
        content: revisionLines.join("\n"),
        attachments: []
      }
    ];
  }

  if (qualityGateEnabled && !passesFormalQualityGate(qualityJudge)) {
    const forcedRevisionLines = [
      "Rewrite the answer one final time under a strict anti-dogma constraint.",
      "You must not rely on repeated ideological scaffolds, sermon-like cadences, or prestige abstractions.",
      "Do not use the not-X-but-Y skeleton, or its Chinese equivalents, as the organizing syntax of the answer.",
      "Every paragraph must do exactly one inferential job: determination, premise, objection, reply, or conclusion.",
      "Shorten the answer and compress all repeated contrasts.",
      "Keep the answer to roughly 6 to 8 short paragraphs and avoid needless expansion.",
      minimizeQuotes
        ? "Use zero direct quotations unless one short quotation is absolutely necessary."
        : "Do not add extra quotations during revision.",
      "If a concept such as universality, actuality, mediation, contradiction, subjectivity, or reason appears, define it locally instead of invoking it as authority.",
      "Advance by consequence and transition rather than by sharp reversals.",
      `Judge summary: ${qualityJudge.summary || "The prose remains too close to doctrinal repetition."}`
    ];

    if (qualityJudge.issues.length) {
      forcedRevisionLines.push(
        "Concrete defects to remove:",
        ...qualityJudge.issues.map((issue) => `- ${issue}`)
      );
    }

    forcedRevisionLines.push(
      "Keep the answer in Chinese, in the first person, with explicit reasons.",
      "Preserve only verified quotation wording."
    );

    reply = finalizeSalonReply(
      await requestChatCompletion(
        config,
        buildChatCompletionMessages(
          augmentedSystemPrompt,
          [
            ...messages,
            { role: "assistant", content: reply, attachments: [] },
            {
              role: "user",
              content: forcedRevisionLines.join("\n"),
              attachments: []
            }
          ]
        )
      )
    );

    attempts += 1;
    validation = validateReplyQuotes(reply, corpusContext);
    qualityJudge = await requestFormalQualityJudge(config, {
      systemPrompt: augmentedSystemPrompt,
      userPrompt: latestUser?.content || "",
      candidateReply: reply,
      mustBeDialectical,
      argumentAuditMode
    });
    strictLogicJudge = await requestStrictLogicJudge(config, {
      userPrompt: latestUser?.content || "",
      candidateReply: reply
    });
    historiographyJudge = historiographyMode
      ? await requestHistoriographyJudge(config, {
          userPrompt: latestUser?.content || "",
          candidateReply: reply,
          historicalContextText: corpusContext?.historical?.contextText || ""
        })
      : buildHistoriographyJudgeDefault();
    selfAudit = auditHegelReply({
      reply,
      userMessage: latestUser?.content || "",
      corpusContext,
      conceptContext: corpusContext?.conceptGraphContext,
      dialecticalPlan: corpusContext?.dialecticalPlan,
      modeRoute: corpusContext?.modeRoute,
      quoteValidation: validation
    });
  }

  if (strictLogicMode && !passesStrictLogicGate(strictLogicJudge)) {
    // Keep answering under the strongest available revision rather than refusing the task.
  }

  if (historiographyMode && !passesHistoriographyGate(historiographyJudge)) {
    // Keep answering under the strongest available revision rather than refusing the task.
  }

  let repairedReply = stripInvalidDirectQuotes(
    reply,
    validation.invalidQuotedSegments
  );
  if (mustPreferChineseQuotes) {
    repairedReply = stripQuotedLatinSegments(repairedReply);
  }
  const repairedValidation = validateReplyQuotes(repairedReply, corpusContext);
  selfAudit = auditHegelReply({
    reply: repairedReply,
    userMessage: latestUser?.content || "",
    corpusContext,
    conceptContext: corpusContext?.conceptGraphContext,
    dialecticalPlan: corpusContext?.dialecticalPlan,
    modeRoute: corpusContext?.modeRoute,
    quoteValidation: repairedValidation
  });

  return {
    reply: repairedReply,
    validation: {
      ...repairedValidation,
      repairedByDequoting:
        validation.invalidQuotedSegments.length > 0 &&
        repairedValidation.passed
    },
    qualityJudge,
    strictLogicJudge,
    historiographyJudge,
    selfAudit,
    modeRoute: corpusContext?.modeRoute,
    conceptGraphContext: corpusContext?.conceptGraphContext
      ? {
          concept_domains: corpusContext.conceptGraphContext.concept_domains || [],
          risk_level: corpusContext.conceptGraphContext.risk_level || "none",
          detected_concepts: (corpusContext.conceptGraphContext.detected_concepts || []).map((item) => ({
            id: item.id,
            domain: item.domain,
            risk_level: item.risk_level,
            score: item.score
          }))
        }
      : null,
    sourceAnchors: corpusContext?.sourceAnchors || [],
    strictLogicScaffold,
    usedConfig: activeConfig,
    attempts,
    history: normalizedHistory,
    userMessage: normalizedHistory[latestUserIndex]
  };
}

async function handleChat(req, res) {
  let context = null;
  const startedAt = Date.now();
  let latestUserForFallback = null;
  let normalizedHistoryForFallback = [];
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (
      !checkRateLimit(
        req,
        res,
        `chat:${context.scope.userId || getClientIp(req)}`,
        80,
        10 * 60 * 1000
      )
    ) {
      return;
    }

    const contentType = String(req.headers["content-type"] || "");
    let history = [];
    let uploadedFiles = [];
    let optimizerMode = false;
    let requestedStyleProfileId = "";
    let requestedChatSessionId = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await readMultipartForm(req);
      const payload = parseJsonSafe(String(formData.get("payload") || "{}"));
      history = Array.isArray(payload.messages) ? payload.messages : [];
      optimizerMode = Boolean(payload.optimizerMode);
      requestedStyleProfileId = String(payload.styleProfileId || "").trim();
      requestedChatSessionId = getRequestedChatSessionId(req, payload);
      uploadedFiles = formData
        .getAll("attachments")
        .filter((entry) => typeof entry !== "string");
      validateUploadedFiles(uploadedFiles);
    } else {
      const body = await readJsonBody(req);
      expectPlainObject(body, "Invalid chat payload.");
      history = Array.isArray(body.messages) ? body.messages : [];
      optimizerMode = Boolean(body.optimizerMode);
      requestedStyleProfileId = getRequestedStyleProfileId(req, body);
      requestedChatSessionId = getRequestedChatSessionId(req, body);
    }

    context = await resolveStyleScope(context, requestedStyleProfileId);
    context = {
      ...context,
      scope: ensureChatSessionForScope(context.scope, requestedChatSessionId)
    };

    const normalizedHistory = publicChatFastMode
      ? limitRecentHistory(history, CHAT_MODEL_HISTORY_LIMIT)
      : normalizeHistoryInput(history);
    normalizedHistoryForFallback = normalizedHistory;
    const latestUser = [...normalizedHistory].reverse().find((item) => item?.role === "user");
    latestUserForFallback = latestUser || null;

    if (!latestUser || !hasMessagePayload(latestUser) && uploadedFiles.length === 0) {
      sendJson(res, 400, { error: "\u8bf7\u5148\u63d0\u4f9b\u6587\u5b57\u6216\u9644\u4ef6\u518d\u63d0\u95ee\u3002" });
      return;
    }

    const chatDeadlineMs = optimizerMode
      ? optimizerChatTotalTimeoutMs
      : publicChatFastMode
        ? publicChatTotalTimeoutMs
        : 140000;
    const result = await withDeadline(
      requestOnlineHegelReply(normalizedHistory, uploadedFiles, {
        optimizerMode,
        scope: context.scope
      }),
      chatDeadlineMs,
      "公网聊天请求超时：模型或上游网关没有在安全窗口内返回，请稍后重试。"
    );
    const reply = result.reply;
    const responsePayload = {
      mode: "online",
      reply,
      validation: result.validation,
      qualityJudge: result.qualityJudge,
      strictLogicJudge: result.strictLogicJudge,
      historiographyJudge: result.historiographyJudge,
      selfAudit: result.selfAudit,
      modeRoute: result.modeRoute,
      conceptGraphContext: result.conceptGraphContext,
      sourceAnchors: result.sourceAnchors,
      strictLogicScaffold: result.strictLogicScaffold,
      attempts: result.attempts,
      userMessage: result.userMessage || latestUser,
      chatSessionId: context.scope.chatSessionId
    };
    sendJson(res, 200, responsePayload);

    persistChatResultInBackground({
      scope: context.scope,
      history: normalizedHistory,
      reply,
      result,
      latestUser,
      allowMemoryRefresh: !publicChatFastMode
    });
  } catch (error) {
    if (publicChatFastMode && latestUserForFallback && !res.headersSent) {
      const fallbackReason = error instanceof Error
        ? normalizeWhitespace(error.message).slice(0, 240)
        : normalizeWhitespace(String(error || "")).slice(0, 240);
      console.warn("[public-chat fallback]", JSON.stringify({
        chatSessionId: context?.scope?.chatSessionId || null,
        styleProfileId: context?.scope?.styleProfileId || null,
        messageChars: normalizeWhitespace(latestUserForFallback?.content || "").length,
        reason: fallbackReason
      }));
      const fallbackReply = buildPublicFallbackReply(latestUserForFallback, error);
      const fallbackQualityJudge = buildQualityJudgeDefault();
      const fallbackStrictLogicJudge = buildStrictLogicJudgeDefault();
      const fallbackHistoriographyJudge = buildHistoriographyJudgeDefault();
      const fallbackSelfAudit = {
        passed: true,
        severity: "none",
        warnings: [],
        blocking_warnings: [],
        nonblocking_warnings: [],
        coverage_score: 10,
        conceptual_integrity_score: 10,
        required_revision_instructions: [],
        advisory_revision_instructions: []
      };
      sendJson(res, 200, {
        mode: "local-fallback",
        reply: fallbackReply,
        validation: {
          quotedSegments: [],
          candidateSegments: [],
          validQuotedSegments: [],
          invalidQuotedSegments: [],
          passed: true
        },
        qualityJudge: fallbackQualityJudge,
        strictLogicJudge: fallbackStrictLogicJudge,
        historiographyJudge: fallbackHistoriographyJudge,
        selfAudit: fallbackSelfAudit,
        strictLogicScaffold: null,
        attempts: 0,
        userMessage: latestUserForFallback,
        chatSessionId: context?.scope?.chatSessionId || null
      });
      persistChatResultInBackground({
        scope: context?.scope,
        history: normalizedHistoryForFallback,
        reply: fallbackReply,
        result: {
          qualityJudge: fallbackQualityJudge,
          strictLogicJudge: fallbackStrictLogicJudge,
          historiographyJudge: fallbackHistoriographyJudge,
          selfAudit: fallbackSelfAudit,
          userMessage: latestUserForFallback
        },
        latestUser: latestUserForFallback
      });
      return;
    }
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : "\u5728\u7ebf\u6a21\u578b\u8bf7\u6c42\u5931\u8d25\u3002"
    });
  } finally {
    recordUsage(context, "chat", startedAt);
  }
}

async function handleSources(req, res) {
  try {
    if (!checkRateLimit(req, res, `sources:${getClientIp(req)}`, 60, 10 * 60 * 1000)) {
      return;
    }

    const payload = {};

    for (const entry of sourcePanelEntries) {
      try {
        payload[entry.name] = await readFile(entry.path, "utf8");
      } catch {
        payload[entry.name] = "";
      }
    }

    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "\u84b8\u998f\u6750\u6599\u52a0\u8f7d\u5931\u8d25\u3002"
    });
  }
}

async function handleHistory(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (
      !checkRateLimit(
        req,
        res,
        `history:${context.scope.userId || getClientIp(req)}`,
        30,
        5 * 60 * 1000
      )
    ) {
      return;
    }

    context = await resolveStyleScope(context, getRequestedStyleProfileId(req));
    context = {
      ...context,
      scope: ensureChatSessionForScope(context.scope, getRequestedChatSessionId(req))
    };

    const conversation = await readPersistedConversation(context.scope);
    const messages = conversation.length
      ? conversation
      : await readRecentUserMemory(context.scope, 40);
    const sessionRecord = context.scope.chatSessionId
      ? readChatSessionByIdFromDb(context.scope.userId, context.scope.chatSessionId)
      : null;
    sendJson(res, 200, {
      chatSessionId: context.scope.chatSessionId || null,
      session: sessionRecord,
      messages
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load history."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

function resolveRequestPublicBaseUrl(req) {
  if (publicBaseUrl) {
    return publicBaseUrl.replace(/\/+$/, "");
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (httpsEnabled ? "https" : "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || `127.0.0.1:${port}`)
    .split(",")[0]
    .trim();
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function requireConcreteAuthUser(res, context) {
  if (context?.auth?.user?.id) {
    return context.auth.user;
  }

  sendJson(res, 401, {
    error: "A signed-in user is required for saved sessions and Local Agent tasks.",
    authRequired: true
  });
  return null;
}

async function handleChatSessionsGet(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    const user = requireConcreteAuthUser(res, context);
    if (!user) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    ensureDefaultStyleProfileForUser(user.id, user.createdAt || new Date().toISOString());
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 1000)));
    const sessions = listAllChatSessionsForUserFromDb(user.id, limit);
    sendJson(res, 200, {
      sessions,
      sharedScopes: {
        training: "style_profile",
        agentPersonality: "style_profile",
        chatMemory: "chat_session"
      }
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load chat sessions."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

async function handleChatSessionsPost(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    const user = requireConcreteAuthUser(res, context);
    if (!user) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res) || !ensureJsonRequest(req, res)) {
      return;
    }

    const body = expectPlainObject(await readJsonBody(req), "Invalid session payload.");
    context = await resolveStyleScope(context, getRequestedStyleProfileId(req, body));
    const sessionId = normalizeChatSessionId(body.chatSessionId || body.id) || randomUUID();
    const now = new Date().toISOString();
    const session = upsertChatSessionInDb({
      id: sessionId,
      userId: user.id,
      styleProfileId: context.scope.styleProfileId,
      title: sanitizeBoundedText(body.title || "", 80),
      createdAt: now,
      updatedAt: now,
      messageCount: 0
    });
    sendJson(res, 200, { session });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to create chat session."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

async function handleLocalAgentDevicesGet(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    const user = requireConcreteAuthUser(res, context);
    if (!user) {
      return;
    }

    const devices = listLocalAgentDevicesByUserIdFromDb(user.id).map(localAgentDeviceClientRecord);
    sendJson(res, 200, { devices });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load Local Agent devices."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

async function handleLocalAgentDevicesPost(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    const user = requireConcreteAuthUser(res, context);
    if (!user) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res) || !ensureJsonRequest(req, res)) {
      return;
    }

    const body = expectPlainObject(await readJsonBody(req), "Invalid Local Agent device payload.");
    const token = createLocalAgentToken();
    const device = insertLocalAgentDeviceToDb({
      id: randomUUID(),
      userId: user.id,
      name: normalizeLocalAgentDeviceName(body.name),
      tokenHash: hashLocalAgentToken(token),
      capabilities: normalizeLocalAgentCapabilities(body.capabilities),
      createdAt: new Date().toISOString()
    });
    const baseUrl = resolveRequestPublicBaseUrl(req);
    const runnerUrl = `${baseUrl}/local-agent-runner.mjs`;
    const downloadCommand = `curl -fsSL "${runnerUrl}" -o local-agent-runner.mjs`;
    const runCommand = `node local-agent-runner.mjs --server "${baseUrl}" --token "${token}"`;
    const powershellDownloadCommand =
      `Invoke-WebRequest -Uri "${runnerUrl}" -OutFile "local-agent-runner.mjs"`;
    const powershellRunCommand =
      `node .\\local-agent-runner.mjs --server "${baseUrl}" --token "${token}"`;
    sendJson(res, 200, {
      device: localAgentDeviceClientRecord(device),
      token,
      runnerUrl,
      downloadCommand,
      runCommand,
      powershellDownloadCommand,
      powershellRunCommand
    });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to register Local Agent device."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

async function handleLocalAgentDeviceRevokePost(req, res, deviceId) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    const user = requireConcreteAuthUser(res, context);
    if (!user) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    const device = revokeLocalAgentDeviceForUserInDb(user.id, deviceId, new Date().toISOString());
    if (!device) {
      sendJson(res, 404, { error: "Local Agent device not found." });
      return;
    }

    sendJson(res, 200, { device: localAgentDeviceClientRecord(device) });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to revoke Local Agent device."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

async function handleLocalAgentTasksGet(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    const user = requireConcreteAuthUser(res, context);
    if (!user) {
      return;
    }

    const tasks = listLocalAgentTasksByUserIdFromDb(user.id, 25);
    sendJson(res, 200, { tasks });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load Local Agent tasks."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

async function handleLocalAgentTaskStatusGet(req, res, taskId) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    const user = requireConcreteAuthUser(res, context);
    if (!user) {
      return;
    }

    const task = readLocalAgentTaskByIdForUserFromDb(user.id, taskId);
    if (!task) {
      sendJson(res, 404, { error: "Local Agent task not found." });
      return;
    }

    sendJson(res, 200, { task });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load Local Agent task."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

async function handleLocalAgentTasksPost(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    const user = requireConcreteAuthUser(res, context);
    if (!user) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res) || !ensureJsonRequest(req, res)) {
      return;
    }

    const body = expectPlainObject(await readJsonBody(req), "Invalid Local Agent task payload.");
    const deviceId = String(body.deviceId || "").trim();
    const device = readLocalAgentDeviceByIdForUserFromDb(user.id, deviceId);
    if (!device || device.revokedAt) {
      sendJson(res, 404, { error: "Local Agent device not found." });
      return;
    }

    context = await resolveStyleScope(context, getRequestedStyleProfileId(req, body));
    const scopedSession = ensureChatSessionForScope(context.scope, body.chatSessionId || "");
    const promptText = normalizeLocalAgentTaskPrompt(body.prompt || body.task || "");
    if (!promptText) {
      sendJson(res, 400, { error: "Local Agent task prompt is required." });
      return;
    }

    const taskType = normalizeLocalAgentTaskType(body.taskType);
    const now = new Date();
    const task = insertLocalAgentTaskToDb({
      id: randomUUID(),
      userId: user.id,
      deviceId: device.id,
      chatSessionId: scopedSession.chatSessionId || null,
      styleProfileId: context.scope.styleProfileId,
      taskType,
      promptText,
      command: {
        kind: taskType,
        startUrl: sanitizeBoundedText(body.startUrl || "", 1000),
        cwd: sanitizeBoundedText(body.cwd || "", 1000),
        sessionOrigin: "hegel_salon"
      },
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LOCAL_AGENT_TASK_TTL_MS).toISOString()
    });
    sendJson(res, 200, { task });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to queue Local Agent task."
    });
  } finally {
    recordUsage(context, "computer", startedAt);
  }
}

async function handleLocalAgentNextTask(req, res) {
  try {
    const device = await resolveLocalAgentDeviceFromRequest(req, res);
    if (!device) {
      return;
    }

    if (
      !checkRateLimit(
        req,
        res,
        `local-agent-next:${device.id}`,
        1200,
        10 * 60 * 1000
      )
    ) {
      return;
    }

    const task = claimNextLocalAgentTaskForDeviceInDb(device.id, new Date().toISOString());
    sendJson(res, 200, { task });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to claim Local Agent task."
    });
  }
}

async function handleLocalAgentTaskResultPost(req, res, taskId) {
  try {
    const device = await resolveLocalAgentDeviceFromRequest(req, res);
    if (!device) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = expectPlainObject(await readJsonBody(req), "Invalid Local Agent result payload.");
    const finishedAt = new Date().toISOString();
    const task = finishLocalAgentTaskForDeviceInDb({
      deviceId: device.id,
      taskId,
      status: body.status,
      resultText: sanitizeBoundedRawText(body.resultText || body.output || "", 120000),
      errorText: sanitizeBoundedRawText(body.errorText || body.error || "", 120000),
      finishedAt
    });
    if (!task) {
      sendJson(res, 404, { error: "Local Agent task not found." });
      return;
    }

    if (task.finishedAt === finishedAt && task.chatSessionId) {
      const resultText = task.status === "completed"
        ? task.resultText || "Local Agent completed without stdout."
        : [task.errorText || "Local Agent task failed.", task.resultText].filter(Boolean).join("\n\n");
      const existingMessages = readChatSessionMessagesFromDb(task.userId, task.chatSessionId).map((message) => ({
        role: message.role,
        content: message.content,
        attachments: Array.isArray(message.attachments) ? message.attachments : []
      }));
      appendChatSessionMessagesToDb(
        task.userId,
        task.styleProfileId,
        task.chatSessionId,
        [
          ...existingMessages,
          {
            role: "user",
            content: `[Local Agent task]\n${task.promptText}`,
            attachments: []
          },
          {
            role: "assistant",
            content: `[Local Agent result]\n${resultText}`,
            attachments: []
          }
        ],
        finishedAt
      );
    }

    sendJson(res, 200, { task });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to save Local Agent result."
    });
  }
}

function buildStyleClientRecord(userId, style) {
  const memoryProfile = readUserMemoryProfileFromDb(userId, style.id);
  const counts = {
    chatLogs: countUserChatLogsInDb(userId, style.id),
    memoryTurns: countUserMemoryTurnsInDb(userId, style.id),
    trainingRuns: countTrainingRunsByUserIdFromDb(userId, style.id)
  };

  return {
    ...style,
    memoryProfile,
    counts,
    agentSummary: [
      style.trainedStyleSummary ? `训练蒸馏摘要:\n${style.trainedStyleSummary}` : "",
      memoryProfile?.summaryText ? `Agent 记忆摘要:\n${memoryProfile.summaryText}` : "",
      style.description ? `风格说明:\n${style.description}` : "",
      style.userStylePrompt ? `用户风格 Prompt:\n${style.userStylePrompt}` : "",
    ].filter(Boolean).join("\n\n")
  };
}

function buildStylesPayload(userId, requestedStyleId = null) {
  const styles = listStyleProfilesByUserId(userId).map((style) => buildStyleClientRecord(userId, style));
  const currentStyle =
    styles.find((style) => style.id === requestedStyleId) ||
    styles.find((style) => style.styleKey === "default") ||
    styles[0] ||
    null;

  return {
    currentStyleId: currentStyle?.id || null,
    currentStyle,
    styles
  };
}

function buildAdminStyleBucket(userId, style) {
  const memoryProfile = readUserMemoryProfileFromDb(userId, style.id);
  const counts = {
    chatLogs: countUserChatLogsInDb(userId, style.id),
    memoryTurns: countUserMemoryTurnsInDb(userId, style.id),
    trainingRuns: countTrainingRunsByUserIdFromDb(userId, style.id)
  };

  return {
    style: {
      ...style,
      memoryProfile,
      counts,
      agentSummary: [
        style.trainedStyleSummary ? `训练蒸馏摘要:\n${style.trainedStyleSummary}` : "",
        memoryProfile?.summaryText ? `Agent 记忆摘要:\n${memoryProfile.summaryText}` : "",
        style.description ? `风格说明:\n${style.description}` : "",
        style.userStylePrompt ? `用户风格 Prompt:\n${style.userStylePrompt}` : "",
      ].filter(Boolean).join("\n\n")
    },
    counts,
    recentTrainingRuns: listTrainingRunsByUserIdFromDb(userId, style.id, 10),
    recentMemory: readRecentUserMemoryTurnsFromDb(userId, style.id, 10).map((record) => ({
      id: record.id,
      styleProfileId: record.styleProfileId,
      createdAt: record.createdAt,
      userMessage: record.userMessage,
      assistantMessage: record.assistantMessage
    })),
    recentChats: readRecentUserChatLogsFromDb(userId, style.id, 10).map((record) => ({
      id: record.id,
      styleProfileId: record.styleProfileId,
      createdAt: record.createdAt,
      reply: record.reply,
      historyLength: Array.isArray(record.history) ? record.history.length : 0
    }))
  };
}

async function handleStylesGet(req, res) {
  try {
    let context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    context = await resolveStyleScope(context, getRequestedStyleProfileId(req));
    sendJson(res, 200, buildStylesPayload(context.auth.user.id, context.styleProfile?.id || null));
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load styles."
    });
  }
}

async function handleStylesPost(req, res) {
  try {
    let context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = validateStyleProfileBody(await readJsonBody(req), context.auth.user.id);
    const styleId = body.id || randomUUID();
    const created = insertStyleProfile({
      id: styleId,
      userId: context.auth.user.id,
      styleKey: body.styleKey,
      name: body.name,
      description: body.description,
      userStylePrompt: body.userStylePrompt,
      trainedStyleSummary: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null
    });
    sendJson(res, 200, {
      ok: true,
      style: buildStyleClientRecord(context.auth.user.id, created),
      ...buildStylesPayload(context.auth.user.id, created.id)
    });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to create style."
    });
  }
}

async function handleStyleUpdate(req, res, styleProfileId) {
  try {
    let context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = validateStyleProfileBody(await readJsonBody(req), context.auth.user.id);
    const updated = updateStyleProfileById(context.auth.user.id, styleProfileId, {
      name: body.name,
      description: body.description,
      userStylePrompt: body.userStylePrompt,
      updatedAt: new Date().toISOString()
    });
    sendJson(res, 200, {
      ok: true,
      style: buildStyleClientRecord(context.auth.user.id, updated),
      ...buildStylesPayload(context.auth.user.id, updated?.id || styleProfileId)
    });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to update style."
    });
  }
}

async function handleConfigGet(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    if (authEnabled) {
      context = await resolveRequestContext(req);
      if (!requireAuthenticatedUser(res, context)) {
        return;
      }

      const effectiveConfig = await resolveEffectiveApiConfig(context.scope);
      sendJson(res, 200, {
        projectConfig: effectiveConfig.scopedConfig,
        effectiveConfig: {
          provider: effectiveConfig.provider,
          model: effectiveConfig.model,
          baseURL: effectiveConfig.baseURL,
          envKey: effectiveConfig.envKey,
          apiKeyPresent: Boolean(effectiveConfig.apiKey),
          usingProjectConfig: effectiveConfig.usingScopeConfig
        }
      });
      return;
    }

    const projectConfig = await readProjectApiConfig();
    const effectiveConfig = loadCodexOpenAIConfig();

    sendJson(res, 200, {
      projectConfig,
      effectiveConfig: {
        provider: effectiveConfig.provider,
        model: effectiveConfig.model,
        baseURL: effectiveConfig.baseURL,
        envKey: effectiveConfig.envKey,
        apiKeyPresent: Boolean(effectiveConfig.apiKey),
        usingProjectConfig:
          Boolean(projectConfig.apiKey) &&
          !String(projectConfig.apiKey).includes("PASTE_YOUR_API_KEY_HERE")
      }
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load API config."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

async function handleConfigPost(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    if (authEnabled) {
      context = await resolveRequestContext(req);
      if (!requireAuthenticatedUser(res, context)) {
        return;
      }

      if (!ensureJsonRequest(req, res)) {
        return;
      }

      const body = validateApiConfigInput(await readJsonBody(req));
      const projectConfig = await writeScopedApiConfig(context.scope, body);

      sendJson(res, 200, {
        ok: true,
        projectConfig
      });
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = validateApiConfigInput(await readJsonBody(req));
    const projectConfig = await writeProjectApiConfig(body);

    sendJson(res, 200, {
      ok: true,
      projectConfig
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to save API config."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

async function handleAuthSession(req, res) {
  try {
    const auth = await getSessionFromRequest(req);
    sendJson(
      res,
      200,
      {
        authEnabled: auth.enabled,
        httpsEnabled,
        user: auth.user
      },
      {
        "Set-Cookie": issueCsrfCookieHeader(req)
      }
    );
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load session."
    });
  }
}

async function handleAuthSendCode(req, res) {
  try {
    if (!authEnabled) {
      sendJson(res, 404, { error: "Auth mode is disabled." });
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!checkRateLimit(req, res, `send-code:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
      return;
    }

    const body = await readJsonBody(req);
    const result = await sendRegistrationCode({
      account: body.account,
      email: body.email
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to send verification code."
    });
  }
}

async function handleAuthPasswordSendCode(req, res) {
  try {
    if (!authEnabled) {
      sendJson(res, 404, { error: "Auth mode is disabled." });
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!checkRateLimit(req, res, `password-reset-send:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
      return;
    }

    const body = expectPlainObject(await readJsonBody(req), "Invalid password reset payload.");
    const result = await sendPasswordResetCode({
      login: body.login
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to send password reset code."
    });
  }
}

async function handleAuthRegister(req, res) {
  try {
    if (!authEnabled) {
      sendJson(res, 404, { error: "Auth mode is disabled." });
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!checkRateLimit(req, res, `register:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
      return;
    }

    const body = expectPlainObject(await readJsonBody(req), "Invalid registration payload.");
    const user = await completeRegistration({
      account: body.account,
      email: body.email,
      password: body.password,
      code: body.code
    });
    const login = await loginUser({
      login: user.email,
      password: body.password,
      ipAddress: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || "")
    });
    try {
      insertLoginEventToDb({
        userId: login.user.id,
        loginIdentifier: user.email,
        ipAddress: getClientIp(req),
        userAgent: String(req.headers["user-agent"] || ""),
        status: "success",
        reason: "register_auto_login"
      });
    } catch {
      // Keep registration resilient even if audit logging fails.
    }
    sendJson(
      res,
      200,
      {
        ok: true,
        user: login.user
      },
      {
        "Set-Cookie": buildSessionCookie(login.token, req)
      }
    );
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Registration failed."
    });
  }
}

async function handleAuthLogin(req, res) {
  let loginIdentifier = "";
  try {
    if (!authEnabled) {
      sendJson(res, 404, { error: "Auth mode is disabled." });
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

      const body = expectPlainObject(await readJsonBody(req), "Invalid login payload.");
      loginIdentifier = String(body.login || "");
      if (handleBlankLoginIdentifier(req, res, loginIdentifier)) {
        return;
      }
      const normalizedLoginRateKey = normalizeRateLimitIdentity(loginIdentifier);
      if (
        !checkRateLimit(req, res, `login-ip:${getClientIp(req)}`, 10, 10 * 60 * 1000) ||
        !checkRateLimit(req, res, `login-account:${normalizedLoginRateKey}`, 8, 10 * 60 * 1000)
      ) {
        recordSecurityAlert({
          alertType: "login_rate_limited",
          severity: "warning",
          loginIdentifier: normalizedLoginRateKey,
          ipAddress: getClientIp(req),
          userAgent: String(req.headers["user-agent"] || ""),
          route: req.url || "",
          message: "Login attempts hit the rate limit.",
          details: {}
        }).catch(() => {});
        return;
      }
      const adminChallenge = await beginAdminTwoFactorLogin({
        login: loginIdentifier,
        password: body.password,
        ipAddress: getClientIp(req),
        userAgent: String(req.headers["user-agent"] || ""),
        route: req.url || ""
      });
      if (adminChallenge.requiresTwoFactor) {
        sendJson(res, 200, {
          ok: true,
          adminTwoFactorRequired: true,
          login: adminChallenge.normalizedLogin,
          user: adminChallenge.user,
          deliveryMode: adminChallenge.deliveryMode,
          devCode: adminChallenge.devCode
        });
        return;
      }
      const login = await loginUser({
        login: loginIdentifier,
        password: body.password,
        ipAddress: getClientIp(req),
        userAgent: String(req.headers["user-agent"] || "")
      });
      try {
        insertLoginEventToDb({
          userId: login.user.id,
        loginIdentifier,
        ipAddress: getClientIp(req),
        userAgent: String(req.headers["user-agent"] || ""),
        status: "success",
        reason: null
      });
    } catch {
      // Keep login resilient even if audit logging fails.
    }
    sendJson(
      res,
      200,
      {
        ok: true,
        user: login.user
      },
      {
        "Set-Cookie": buildSessionCookie(login.token, req)
      }
    );
  } catch (error) {
    try {
      insertLoginEventToDb({
        userId: null,
        loginIdentifier,
        ipAddress: getClientIp(req),
        userAgent: String(req.headers["user-agent"] || ""),
        status: "failed",
        reason: error instanceof Error ? error.message : "Login failed."
      });
    } catch {
      // Keep login error handling resilient even if audit logging fails.
    }
    const alertType = String(loginIdentifier || "").includes("@") || /admin/i.test(String(loginIdentifier || ""))
      ? "admin_login_failed"
      : "login_failed";
    recordSecurityAlert({
      alertType,
      severity: alertType === "admin_login_failed" ? "warning" : "info",
      loginIdentifier: loginIdentifier || null,
      ipAddress: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
      route: req.url || "",
      message: "Login failed.",
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    }).catch(() => {});
    sendJson(res, 401, {
      error: error instanceof Error ? error.message : "Login failed."
    });
  }
}

async function handleAdminTwoFactorVerify(req, res) {
  let loginIdentifier = "";
  try {
    if (!authEnabled) {
      sendJson(res, 404, { error: "Auth mode is disabled." });
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    const body = expectPlainObject(await readJsonBody(req), "Invalid 2FA payload.");
    loginIdentifier = String(body.login || "");
    const normalizedLoginRateKey = normalizeRateLimitIdentity(loginIdentifier);
    if (
      !checkRateLimit(req, res, `admin-2fa-ip:${getClientIp(req)}`, 10, 10 * 60 * 1000) ||
      !checkRateLimit(req, res, `admin-2fa-account:${normalizedLoginRateKey}`, 6, 10 * 60 * 1000)
    ) {
      return;
    }

    const login = await verifyAdminTwoFactorLogin({
      login: loginIdentifier,
      code: String(body.code || ""),
      ipAddress: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
      route: req.url || ""
    });
    insertLoginEventToDb({
      userId: login.user.id,
      loginIdentifier,
      ipAddress: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
      status: "success",
      reason: "admin_2fa_verified"
    });
    sendJson(
      res,
      200,
      {
        ok: true,
        user: login.user
      },
      {
        "Set-Cookie": buildSessionCookie(login.token, req)
      }
    );
  } catch (error) {
    recordSecurityAlert({
      alertType: "admin_2fa_failed",
      severity: "warning",
      loginIdentifier: loginIdentifier || null,
      ipAddress: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
      route: req.url || "",
      message: "Administrator two-factor verification failed.",
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    }).catch(() => {});
    sendJson(res, 401, {
      error: error instanceof Error ? error.message : "Admin two-factor verification failed."
    });
  }
}

async function handleAuthPasswordReset(req, res) {
  try {
    if (!authEnabled) {
      sendJson(res, 404, { error: "Auth mode is disabled." });
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!checkRateLimit(req, res, `password-reset:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
      return;
    }

    const body = expectPlainObject(await readJsonBody(req), "Invalid password reset payload.");
    const result = await resetPasswordWithCode({
      login: body.login,
      code: body.code,
      password: body.password
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Password reset failed."
    });
  }
}

async function handleAuthLogout(req, res) {
  try {
    await logoutRequest(req);
    sendJson(
      res,
      200,
      {
        ok: true
      },
      {
        "Set-Cookie": buildClearedSessionCookie(req)
      }
    );
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Logout failed."
    });
  }
}

function defaultComputerState() {
  return {
    status: "idle",
    screenshot: null,
    currentUrl: "",
    title: "",
    transcript: [],
    finalText: ""
  };
}

async function readComputerState(scope = buildRuntimeScope()) {
  if (!existsSync(scope.computerStatePath)) {
    return defaultComputerState();
  }

  return readJsonFileWithRecovery(scope.computerStatePath, defaultComputerState, {
    normalize: (value) => ({ ...defaultComputerState(), ...(value || {}) }),
    rewriteOnFailure: true
  });
}

async function writeComputerState(state, scope = buildRuntimeScope()) {
  await ensureDataDirs(scope);
  await writeJsonFileAtomic(scope.computerStatePath, state);
}

async function readOptimizerProgress(scope = buildRuntimeScope()) {
  function normalizeOptimizerProgressScale(progress = {}) {
    const normalized = { ...(progress || {}) };
    if (Number(normalized.averageScore || 0) > 10) {
      normalized.averageScore = Number((Number(normalized.averageScore || 0) / 10).toFixed(2));
    }
    if (Number(normalized.successfulAverageScore || 0) > 10) {
      normalized.successfulAverageScore = Number((Number(normalized.successfulAverageScore || 0) / 10).toFixed(2));
    }
    if (normalized.lastFailure && Number(normalized.lastFailure.score || 0) > 10) {
      normalized.lastFailure = {
        ...normalized.lastFailure,
        score: Number((Number(normalized.lastFailure.score || 0) / 10).toFixed(2))
      };
    }
    return normalized;
  }

  const fallbackProgress = {
    done: false,
    targetScore: 9,
    iterationsTarget: 0,
    completed: 0,
    successCount: 0,
    timeoutCount: 0,
    failures: 0,
    averageScore: 0,
    successfulAverageScore: 0,
    lastFailure: null
  };

  try {
    if (!existsSync(scope.optimizerProgressPath)) {
      return fallbackProgress;
    }

    return await readJsonFileWithRecovery(scope.optimizerProgressPath, fallbackProgress, {
      normalize: normalizeOptimizerProgressScale,
      rewriteOnFailure: true
    });
  } catch {
    return {
      done: false,
      targetScore: 9,
      iterationsTarget: 0,
      completed: 0,
      successCount: 0,
      timeoutCount: 0,
      failures: 0,
      averageScore: 0,
      successfulAverageScore: 0,
      lastFailure: null
    };
  }
}

function listOptimizerProcesses() {
  try {
    const { stdout } = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*runQualityOptimizer.mjs*' } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"
      ],
      { encoding: "utf8" }
    );
    const parsed = parseJsonSafe(String(stdout || "").trim());
    const rows = Array.isArray(parsed) ? parsed : parsed?.ProcessId ? [parsed] : [];
    return rows.map((row) => ({
      pid: Number(row.ProcessId),
      commandLine: String(row.CommandLine || "")
    })).filter((row) => Number.isFinite(row.pid) && row.pid > 0);
  } catch {
    return [];
  }
}

function getOptimizerProcesses(userId = null, styleProfileId = null) {
  if (userId && !isUuidLike(userId)) {
    return [];
  }

  const normalizedUserId = String(userId || "").trim();
  const normalizedStyleId = String(styleProfileId || "").trim();

  return listOptimizerProcesses().filter((item) => {
    if (!item.commandLine.includes("runQualityOptimizer.mjs")) {
      return false;
    }

    if (normalizedUserId && (!item.commandLine.includes("--user-id") || !item.commandLine.includes(normalizedUserId))) {
      return false;
    }

    if (
      normalizedStyleId &&
      (!item.commandLine.includes("--style-profile-id") || !item.commandLine.includes(normalizedStyleId))
    ) {
      return false;
    }

    return true;
  });
}

function getOptimizerPidList(userId = null, styleProfileId = null) {
  return getOptimizerProcesses(userId, styleProfileId).map((item) => item.pid);
}

async function terminateOptimizerProcesses(userId = null, styleProfileId = null) {
  const targets = getOptimizerProcesses(userId, styleProfileId);
  if (!targets.length) {
    return [];
  }

  const pidArgs = targets.map((item) => String(item.pid)).join(",");
  try {
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `@(${pidArgs}) | ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {} }`
    ]);
  } catch {
    // Ignore stop failures here and verify below.
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    const remaining = getOptimizerProcesses(userId, styleProfileId);
    if (!remaining.length) {
      return targets.map((item) => item.pid);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return targets.map((item) => item.pid);
}

async function handleTrainingStatus(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (
      !checkRateLimit(
        req,
        res,
        `training-status:${context.scope.userId || getClientIp(req)}`,
        240,
        10 * 60 * 1000
      )
    ) {
      return;
    }

    context = await resolveStyleScope(context, getRequestedStyleProfileId(req));

    const [rawProgress, judgePrompt, playbook, previousRuns] = await Promise.all([
      readOptimizerProgress(context.scope),
      readOptimizerJudgePrompt(context.scope.userId, context.scope.styleProfileId),
      readOptimizerPlaybook(context.scope.userId, context.scope.styleProfileId),
      Promise.resolve(listTrainingRunsByUserIdFromDb(context.scope.userId, context.scope.styleProfileId, 10))
    ]);
    let progress = rawProgress;
    const latestStyleSummary = buildTrainedStyleSummaryFromPlaybook(playbook);
    if (latestStyleSummary && context.styleProfile?.id) {
      updateStyleProfileById(context.scope.userId, context.styleProfile.id, {
        trainedStyleSummary: latestStyleSummary,
        updatedAt: new Date().toISOString()
      });
    }
    const liveProcesses = getOptimizerProcesses(
      context.scope.userId,
      context.scope.styleProfileId
    );
    const livePids = liveProcesses.map((item) => item.pid);
    const latestPreviousRun = previousRuns[0] || null;
    const latestStartedAt = latestPreviousRun?.startedAt
      ? new Date(latestPreviousRun.startedAt).getTime()
      : 0;
    const latestProgressAt = progress?.updatedAt
      ? new Date(progress.updatedAt).getTime()
      : 0;
    const progressFreshWindowMs = latestPreviousRun?.timeoutMs
      ? Math.max(30000, Number(latestPreviousRun.timeoutMs || 0) + 30000)
      : 210000;
    const hasUnfinishedWork =
      !progress.done &&
      Number(progress.completed || 0) < Math.max(
        Number(progress.iterationsTarget || 0),
        Number(latestPreviousRun?.iterationsTarget || 0),
        0
      );
    const withinStartupGrace =
      latestPreviousRun &&
      ["running", "starting"].includes(String(latestPreviousRun.status || "")) &&
      latestStartedAt > 0 &&
      Date.now() - latestStartedAt < 15000;
    const latestRunPid = Number(latestPreviousRun?.pid || 0);
    const matchingLivePid =
      latestRunPid > 0 ? liveProcesses.find((item) => item.pid === latestRunPid) : null;
    const inferredRunning =
      Boolean(matchingLivePid) ||
      Boolean(
        latestPreviousRun &&
        !latestPreviousRun.finishedAt &&
        hasUnfinishedWork &&
        latestProgressAt > 0 &&
        Date.now() - latestProgressAt < progressFreshWindowMs
      );
    if (
      latestPreviousRun &&
      String(latestPreviousRun.status || "") === "completed" &&
      !inferredRunning
    ) {
      progress = {
        ...progress,
        done: true,
        updatedAt: latestPreviousRun.finishedAt || progress.updatedAt || new Date().toISOString(),
        completed: Math.max(
          Number(progress.completed || 0),
          Number(latestPreviousRun.iterationsTarget || progress.iterationsTarget || 0)
        ),
        successCount: Math.max(
          Number(progress.successCount || 0),
          Math.min(
            Number(latestPreviousRun.iterationsTarget || 0),
            Math.max(0, Number(progress.completed || 0))
          )
        )
      };
    }
    const latestRunId = updateLatestTrainingRunForUserInDb(context.scope.userId, {
      styleProfileId: context.scope.styleProfileId,
      status: inferredRunning
        ? "running"
        : progress.done
          ? "completed"
          : withinStartupGrace
            ? "starting"
            : "stopped",
      pid: matchingLivePid?.pid || latestPreviousRun?.pid || null,
      finishedAt:
        !inferredRunning && progress.done
          ? progress.updatedAt || new Date().toISOString()
          : null,
      progress
    });
    stopOtherRunningTrainingRunsForUserInDb(
      context.scope.userId,
      context.scope.styleProfileId,
      latestRunId,
      progress.updatedAt || new Date().toISOString()
    );
    const recentRuns = listTrainingRunsByUserIdFromDb(context.scope.userId, context.scope.styleProfileId, 10);
    sendJson(res, 200, {
      running: inferredRunning || withinStartupGrace,
      progress,
      judgePrompt,
      playbook,
      trainedStyleSummary: latestStyleSummary || context.styleProfile?.trainedStyleSummary || "",
      recentRuns
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load training status."
    });
  } finally {
    recordUsage(context, "training", startedAt);
  }
}

async function handleTrainingPromptPost(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = validateTrainingPromptBody(await readJsonBody(req));
    context = await resolveStyleScope(context, getRequestedStyleProfileId(req, body));
    const prompt = normalizeWhitespace(body.judgePrompt || "");
    await writeOptimizerJudgePrompt(prompt, context.scope.userId, context.scope.styleProfileId);
    sendJson(res, 200, { ok: true, judgePrompt: prompt });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to save training prompt."
    });
  } finally {
    recordUsage(context, "training", startedAt);
  }
}

async function handleTrainingStart(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = validateTrainingStartBody(await readJsonBody(req));
    context = await resolveStyleScope(context, getRequestedStyleProfileId(req, body));
    const apiConfig = await resolveEffectiveApiConfig(context.scope);
    const { iterations, concurrency, targetScore, timeoutMs } = body;
    const sessionToken = readCookieValue(req.headers.cookie || "", getAuthCookieName());
    const runId = randomUUID();

    if (!apiConfig.model || !apiConfig.baseURL || !apiConfig.apiKey) {
      sendJson(res, 400, {
        error: "当前登录用户尚未完整配置训练所需的 model / baseURL / apiKey。"
      });
      return;
    }

    await terminateOptimizerProcesses(context.scope.userId, context.scope.styleProfileId);

    await ensureDataDirs(context.scope);
    try {
      await writeTextFileAtomic(context.scope.optimizerProgressPath, "");
    } catch {
      // Ignore reset failures.
    }

    const optimizer = spawn(
      process.execPath,
      [
        join("src", "runQualityOptimizer.mjs"),
        "--user-id",
        String(context.scope.userId || "global"),
        "--style-profile-id",
        String(context.scope.styleProfileId || "")
      ],
      {
        cwd: root,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: {
          ...process.env,
          HEGEL_API_URL: `http://127.0.0.1:${port}/api/chat`,
          HEGEL_USER_ID: String(context.scope.userId || ""),
          HEGEL_STYLE_PROFILE_ID: String(context.scope.styleProfileId || ""),
          HEGEL_SESSION_TOKEN: sessionToken,
          OPENAI_PROVIDER: apiConfig.provider || "",
          OPENAI_MODEL: apiConfig.model || "",
          OPENAI_BASE_URL: apiConfig.baseURL || "",
          OPENAI_API_KEY: apiConfig.apiKey || "",
          HEGEL_OPTIMIZER_ITERATIONS: String(iterations),
          HEGEL_OPTIMIZER_CONCURRENCY: String(concurrency),
          HEGEL_OPTIMIZER_TARGET: String(targetScore),
          HEGEL_OPTIMIZER_TIMEOUT_MS: String(timeoutMs),
          HEGEL_OPTIMIZER_SALON_TIMEOUT_MS: String(
            Math.max(timeoutMs, Math.min(optimizerChatTotalTimeoutMs, 300000))
          ),
          HEGEL_OPTIMIZER_CHAT_RETRIES: "2"
        }
      }
    );

    optimizer.once("error", (error) => {
      try {
        updateLatestTrainingRunForUserInDb(context.scope.userId, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          pid: optimizer.pid,
          progress: {
            error: error instanceof Error ? error.message : String(error)
          }
        });
      } catch {
        // Keep server resilient if background run status persistence fails.
      }
    });

    optimizer.once("exit", (code, signal) => {
      try {
        updateLatestTrainingRunForUserInDb(context.scope.userId, {
          status: code === 0 ? "completed" : "failed",
          finishedAt: new Date().toISOString(),
          pid: optimizer.pid,
          progress: code === 0
            ? null
            : {
                error: `optimizer exited with code ${code ?? "null"} signal ${signal ?? "null"}`
              }
        });
      } catch {
        // Keep server resilient if background run status persistence fails.
      }
    });

    optimizer.unref();
    insertTrainingRunToDb({
      id: runId,
      userId: context.scope.userId,
      styleProfileId: context.scope.styleProfileId,
      startedAt: new Date().toISOString(),
      status: "starting",
      pid: optimizer.pid,
      iterationsTarget: iterations,
      concurrency,
      targetScore,
      timeoutMs,
      progress: null
    });
    sendJson(res, 200, {
      ok: true,
      runId,
      pid: optimizer.pid,
      iterations,
      concurrency,
      targetScore,
      timeoutMs
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to start training."
    });
  } finally {
    recordUsage(context, "training", startedAt);
  }
}

async function buildAdminUserSnapshot(user) {
  const scope = buildRuntimeScope(user.id);
  const [logsStats, uploadsStats, computerStats, browserStats, progress, computerState] =
    await Promise.all([
      collectDirectoryStats(scope.logsDir),
      collectDirectoryStats(scope.uploadsDir),
      collectDirectoryStats(scope.computerDir),
      collectDirectoryStats(scope.browserSessionsRoot),
      readOptimizerProgress(scope),
      readComputerState(scope)
    ]);

  const totalBytes =
    logsStats.totalBytes +
    uploadsStats.totalBytes +
    computerStats.totalBytes +
    browserStats.totalBytes;

  return {
    ...user,
    runtime: {
      optimizerRunning: getOptimizerPidList(user.id).length > 0,
      computerStatus: computerState.status || "idle"
    },
    databaseData: {
      chatLogs: countUserChatLogsInDb(user.id),
      memoryTurns: countUserMemoryTurnsInDb(user.id),
      loginEvents: countLoginEventsByUserIdFromDb(user.id),
      trainingRuns: countTrainingRunsByUserIdFromDb(user.id),
      usageDays: countUsageRowsByUserIdFromDb(user.id),
      styleProfiles: listStyleProfilesByUserId(user.id).length
    },
    storage: {
      totalBytes,
      logs: logsStats,
      uploads: uploadsStats,
      computer: computerStats,
      browser: browserStats
    },
    optimizer: {
      completed: Number(progress.completed || 0),
      averageScore: Number(progress.averageScore || 0),
      successCount: Number(progress.successCount || 0),
      timeoutCount: Number(progress.timeoutCount || 0),
      done: Boolean(progress.done)
    }
  };
}

async function buildAdminOverviewPayload() {
  const users = await listUsersForAdmin();
  const snapshots = await Promise.all(users.map((user) => buildAdminUserSnapshot(user)));
  const totals = snapshots.reduce(
    (sum, user) => {
      sum.totalUsers += 1;
      sum.adminUsers += user.role === "admin" ? 1 : 0;
      sum.disabledUsers += user.disabledAt ? 1 : 0;
      sum.activeSessions += Number(user.sessionCount || 0);
      sum.totalBytes += Number(user.storage?.totalBytes || 0);
      return sum;
    },
    {
      totalUsers: 0,
      adminUsers: 0,
      disabledUsers: 0,
      activeSessions: 0,
      totalBytes: 0
    }
  );

  return {
    database: {
      path: getUserDatabasePath(),
      health: getUserDatabaseHealth()
    },
    summary: totals,
    users: snapshots.sort((left, right) =>
      String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
    )
  };
}

async function handleAdminAnalytics(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

      const recentLoginEvents = listRecentLoginEventsFromDb(40);
      const recentSecurityAlerts = listRecentSecurityAlertsFromDb(30);
      const recentSecurityAuditEvents = listRecentSecurityAuditEventsFromDb(40);
      const recentTrainingRuns = listRecentTrainingRunsFromDb(30);
      const usageTimeline = readGlobalUsageTimelineFromDb(30);

      sendJson(res, 200, {
        database: {
          path: getUserDatabasePath(),
          backupDir: getUserDatabaseBackupDir()
        },
        recentLoginEvents,
        recentSecurityAlerts,
        recentSecurityAuditEvents,
        recentTrainingRuns,
        usageTimeline
      });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load admin analytics."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminUsersList(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    const users = await listUsersForAdmin();
    const payload = users
      .map((user) => ({
        ...user,
        databaseData: {
          chatLogs: countUserChatLogsInDb(user.id),
          memoryTurns: countUserMemoryTurnsInDb(user.id),
          trainingRuns: countTrainingRunsByUserIdFromDb(user.id)
        }
      }))
      .sort((left, right) =>
        String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
      );

    sendJson(res, 200, {
      users: payload
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load admin users."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminDatabaseHealth(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    sendJson(res, 200, getUserDatabaseHealth());
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load database health."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminDatabaseBackup(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    const backup = createUserDatabaseBackup();
    sendJson(res, 200, {
      ok: true,
      backup
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to create database backup."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminUserData(req, res, userId) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    const normalizedUserId = requireUuid(userId, "userId");
    const styles = listStyleProfilesByUserId(normalizedUserId).map((style) =>
      buildStyleClientRecord(normalizedUserId, style)
    );
    const styleBuckets = styles.map((style) => buildAdminStyleBucket(normalizedUserId, style));
    const recentMemory = readRecentUserMemoryTurnsFromDb(normalizedUserId, null, 8).map((record) => ({
      id: record.id,
      styleProfileId: record.styleProfileId,
      createdAt: record.createdAt,
      userMessage: record.userMessage,
      assistantMessage: record.assistantMessage
    }));
    const recentChats = readRecentUserChatLogsFromDb(normalizedUserId, null, 5).map((record) => ({
      id: record.id,
      styleProfileId: record.styleProfileId,
      createdAt: record.createdAt,
      reply: record.reply,
      historyLength: Array.isArray(record.history) ? record.history.length : 0
    }));
    const recentSessions = listSessionsByUserIdFromDb(normalizedUserId, 10).map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      lastSeenAt: record.lastSeenAt,
      expiresAt: record.expiresAt,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent
    }));
    const recentLoginEvents = listLoginEventsByUserIdFromDb(normalizedUserId, 10);
    const recentTrainingRuns = listTrainingRunsByUserIdFromDb(normalizedUserId, null, 10);
    const usageSummary = readUserUsageSummaryFromDb(normalizedUserId, 30);
    const apiConfig = readUserApiConfigFromDb(normalizedUserId);

    sendJson(res, 200, {
      userId: normalizedUserId,
      apiConfig: apiConfig
        ? {
            provider: apiConfig.provider,
            model: apiConfig.model,
            baseURL: apiConfig.baseURL,
            apiKeyPresent: Boolean(apiConfig.apiKey),
            updatedAt: apiConfig.updatedAt
          }
        : null,
      recentSessions,
      recentLoginEvents,
      recentTrainingRuns,
      usageSummary,
      styles,
      styleBuckets,
      recentMemory,
      recentChats
    });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to load user data."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function clearUserRuntimeData(userId, targets = []) {
  const scope = buildRuntimeScope(userId);
  const activeTargets = new Set(
    Array.isArray(targets) && targets.length
      ? targets.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : ["logs", "uploads", "computer", "browser"]
  );

  if (activeTargets.has("logs")) {
    for (const pid of getOptimizerPidList(userId)) {
      try {
        await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
      } catch {
        // Ignore already-stopped optimizer workers.
      }
    }
    await clearDirectoryContents(scope.logsDir);
  }

  clearUserBusinessDataInDb(userId, ["chat", "memory", "api_config"]);

  if (activeTargets.has("uploads")) {
    await clearDirectoryContents(scope.uploadsDir);
  }

  if (activeTargets.has("computer")) {
    await stopComputerWorker(scope);
    await clearDirectoryContents(scope.computerDir);
  }

  if (activeTargets.has("browser")) {
    await clearDirectoryContents(scope.browserSessionsRoot);
  }

  await ensureDataDirs(scope);
}

async function handleAdminOverview(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (
      !checkRateLimit(
        req,
        res,
        `admin-overview:${context.scope.userId || getClientIp(req)}`,
        60,
        10 * 60 * 1000
      )
    ) {
      return;
    }

    if (
      adminOverviewCache.payload &&
      Date.now() - adminOverviewCache.updatedAt < ADMIN_OVERVIEW_CACHE_MS
    ) {
      sendJson(res, 200, {
        ...adminOverviewCache.payload,
        cached: true
      });
      return;
    }

    const payload = await buildAdminOverviewPayload();
    adminOverviewCache.payload = payload;
    adminOverviewCache.updatedAt = Date.now();
    sendJson(res, 200, {
      ...payload,
      cached: false
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load admin overview."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminMailConfigGet(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    const config = await loadMailConfig();
    sendJson(res, 200, {
      config,
      realMailEnabled: !isConsoleMailConfig(config)
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load mail config."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminMailConfigPost(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const config = validateMailConfigBody(await readJsonBody(req));
    const saved = await writeMailConfig(config);
    sendJson(res, 200, {
      ok: true,
      config: saved,
      realMailEnabled: !isConsoleMailConfig(saved)
    });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to save mail config."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminMailTest(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = validateMailTestBody(await readJsonBody(req));
    const result = await sendTestMail({
      to: body.to,
      config: body.config
    });
    sendJson(res, 200, {
      ok: true,
      mode: result.mode
    });
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : "Failed to send test email."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminUserDisable(req, res, userId) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = validateAdminDisableBody(await readJsonBody(req));
    const normalizedUserId = requireUuid(userId, "userId");
    const disabled = body.disabled === true;

    if (disabled && context.auth.user?.id === normalizedUserId) {
      sendJson(res, 400, {
        error: "You cannot disable the current administrator session owner."
      });
      return;
    }

    const user = await setUserDisabled(normalizedUserId, disabled);
    if (disabled) {
      await revokeUserSessions(normalizedUserId);
      for (const pid of getOptimizerPidList(normalizedUserId)) {
        try {
          await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
        } catch {
          // Ignore optimizer cleanup failures during disable.
        }
      }
      await stopComputerWorker(buildRuntimeScope(normalizedUserId));
    }
    clearAdminOverviewCache();

    sendJson(res, 200, {
      ok: true,
      user
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to update user status."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminUserRevokeSessions(req, res, userId) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const normalizedUserId = requireUuid(userId, "userId");
    const result = await revokeUserSessions(normalizedUserId);
    clearAdminOverviewCache();
    sendJson(res, 200, {
      ok: true,
      ...result
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to revoke user sessions."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

async function handleAdminUserClearData(req, res, userId) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAdminUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = validateAdminClearDataBody(await readJsonBody(req));
    const normalizedUserId = requireUuid(userId, "userId");
    await clearUserRuntimeData(normalizedUserId, body.targets);
    clearAdminOverviewCache();
    sendJson(res, 200, {
      ok: true,
      userId: normalizedUserId
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to clear user data."
    });
  } finally {
    recordUsage(context, "admin", startedAt);
  }
}

function readComputerWorkerPid(scope = buildRuntimeScope()) {
  try {
    if (!existsSync(scope.computerWorkerPidPath)) {
      return null;
    }

    const raw = readFileSync(scope.computerWorkerPidPath, "utf8").trim();
    const pid = Number(raw);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function resolveComputerDebugPort(scope = buildRuntimeScope()) {
  if (!scope.userId) {
    return 9333;
  }

  const hash = [...String(scope.userId)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 9400 + (hash % 400);
}

async function stopComputerWorker(scope = buildRuntimeScope()) {
  const pid = readComputerWorkerPid(scope);
  if (!pid) {
    return;
  }

  try {
    const { stdout } = await execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object -ExpandProperty CommandLine)`
      ],
      { windowsHide: true }
    );

    const commandLine = String(stdout || "");
    if (!commandLine.includes("browserComputerWorker.mjs")) {
      return;
    }

    await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
  } catch {
    // Ignore missing worker failures.
  }

  try {
    await writeTextFileAtomic(scope.computerWorkerPidPath, "");
  } catch {
    // Ignore pid cleanup failures.
  }
}

async function startComputerWorker({
  task,
  startUrl,
  scope = buildRuntimeScope(),
  envOverrides = {}
}) {
  await ensureDataDirs(scope);
  await stopComputerWorker(scope);

  const worker = spawn(
    process.execPath,
    [
      computerWorkerScriptPath,
      "--state-path",
      scope.computerStatePath,
      "--debug-port",
      String(resolveComputerDebugPort(scope)),
      "--profile-root",
      scope.browserSessionsRoot,
      "--task",
      task,
      "--start-url",
      startUrl || ""
    ],
    {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        ...envOverrides
      }
    }
  );

  worker.unref();
  await writeTextFileAtomic(scope.computerWorkerPidPath, String(worker.pid));
}

async function handleComputerState(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (
      !checkRateLimit(
        req,
        res,
        `computer-state:${context.scope.userId || getClientIp(req)}`,
        900,
        10 * 60 * 1000
      )
    ) {
      return;
    }

    sendJson(res, 200, await readComputerState(context.scope));
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load computer state."
    });
  } finally {
    recordUsage(context, "computer", startedAt);
  }
}

async function handleComputerReset(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    await stopComputerWorker(context.scope);
    const state = defaultComputerState();
    await writeComputerState(state, context.scope);
    sendJson(res, 200, { ok: true, state });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to reset computer use."
    });
  } finally {
    recordUsage(context, "computer", startedAt);
  }
}

async function handleComputerTask(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    if (!ensureNotSuspiciousClient(req, res)) {
      return;
    }

    if (!ensureJsonRequest(req, res)) {
      return;
    }

    const body = validateComputerTaskBody(await readJsonBody(req));
    if (publicBaseUrl) {
      sendJson(res, 409, {
        error: "Public Computer Use must run through the user's Local Agent, not the server host."
      });
      return;
    }

    const apiConfig = await resolveEffectiveApiConfig(context.scope);
    const { task, startUrl } = body;

    const state = {
      ...defaultComputerState(),
      status: "running"
    };
    await writeComputerState(state, context.scope);
    await startComputerWorker({
      task,
      startUrl,
      scope: context.scope,
      envOverrides: {
        OPENAI_PROVIDER: apiConfig.provider || "",
        OPENAI_MODEL: apiConfig.model || "",
        OPENAI_BASE_URL: apiConfig.baseURL || "",
        OPENAI_API_KEY: apiConfig.apiKey || ""
      }
    });
    sendJson(res, 200, { ok: true, state });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Computer use failed."
    });
  } finally {
    recordUsage(context, "computer", startedAt);
  }
}

async function handleToolsCatalog(req, res) {
  let context = null;
  const startedAt = Date.now();
  try {
    context = await resolveRequestContext(req);
    if (!requireAuthenticatedUser(res, context)) {
      return;
    }

    sendJson(res, 200, {
      tools: listRegisteredTools({
        includeAdmin: Boolean(context.auth?.user?.role === "admin")
      })
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load tool catalog."
    });
  } finally {
    recordUsage(context, "settings", startedAt);
  }
}

const toolDispatchTable = {
  "tools.catalog": async (req, res) => handleToolsCatalog(req, res),
  "chat.ask": async (req, res) => handleChat(req, res),
  "chat.sessions.list": async (req, res) => handleChatSessionsGet(req, res),
  "chat.sessions.create": async (req, res) => handleChatSessionsPost(req, res),
  "sources.read": async (req, res) => handleSources(req, res),
  "history.read": async (req, res) => handleHistory(req, res),
  "styles.list": async (req, res) => handleStylesGet(req, res),
  "styles.create": async (req, res) => handleStylesPost(req, res),
  "styles.update": async (req, res, params) => handleStyleUpdate(req, res, params.styleProfileId),
  "config.read": async (req, res) => handleConfigGet(req, res),
  "config.save": async (req, res) => handleConfigPost(req, res),
  "training.status": async (req, res) => handleTrainingStatus(req, res),
  "training.prompt.save": async (req, res) => handleTrainingPromptPost(req, res),
  "training.start": async (req, res) => handleTrainingStart(req, res),
  "computer.state": async (req, res) => handleComputerState(req, res),
  "computer.reset": async (req, res) => handleComputerReset(req, res),
  "computer.task": async (req, res) => handleComputerTask(req, res),
  "local_agent.devices.list": async (req, res) => handleLocalAgentDevicesGet(req, res),
  "local_agent.devices.create": async (req, res) => handleLocalAgentDevicesPost(req, res),
  "local_agent.devices.revoke": async (req, res, params) => handleLocalAgentDeviceRevokePost(req, res, params.deviceId),
  "local_agent.tasks.list": async (req, res) => handleLocalAgentTasksGet(req, res),
  "local_agent.tasks.create": async (req, res) => handleLocalAgentTasksPost(req, res),
  "local_agent.tasks.next": async (req, res) => handleLocalAgentNextTask(req, res),
  "local_agent.tasks.status": async (req, res, params) => handleLocalAgentTaskStatusGet(req, res, params.taskId),
  "local_agent.tasks.finish": async (req, res, params) => handleLocalAgentTaskResultPost(req, res, params.taskId),
  "admin.overview": async (req, res) => handleAdminOverview(req, res),
  "admin.analytics": async (req, res) => handleAdminAnalytics(req, res),
  "admin.users.list": async (req, res) => handleAdminUsersList(req, res),
  "admin.database.health": async (req, res) => handleAdminDatabaseHealth(req, res),
  "admin.database.backup": async (req, res) => handleAdminDatabaseBackup(req, res),
  "admin.mail.config.read": async (req, res) => handleAdminMailConfigGet(req, res),
  "admin.mail.config.save": async (req, res) => handleAdminMailConfigPost(req, res),
  "admin.mail.test": async (req, res) => handleAdminMailTest(req, res),
  "admin.user.data.read": async (req, res, params) => handleAdminUserData(req, res, params.userId),
  "admin.user.disable": async (req, res, params) => handleAdminUserDisable(req, res, params.userId),
  "admin.user.revoke_sessions": async (req, res, params) => handleAdminUserRevokeSessions(req, res, params.userId),
  "admin.user.clear_data": async (req, res, params) => handleAdminUserClearData(req, res, params.userId)
};

const requestHandler = async (req, res) => {
  res.__hegelRequest = req;

  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "\u8bf7\u6c42\u65e0\u6548\u3002" });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (maybeRedirectCanonicalHost(req, res, url)) {
    return;
  }

  const adminUserActionMatch = url.pathname.match(
    /^\/api\/admin\/users\/([^/]+)\/(set-disabled|revoke-sessions|clear-data)$/
  );
  const adminUserDataMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/data$/);
  const styleUpdateMatch = url.pathname.match(/^\/api\/styles\/([^/]+)$/);
  const registeredToolMatch = matchRegisteredTool(req.method, url.pathname);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...buildCorsHeaders(req),
      ...buildSecurityHeaders(req)
    });
    res.end();
    return;
  }

  if (!ensureCsrfProtection(req, res)) {
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    await handleAuthSession(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register/send-code") {
    await handleAuthSendCode(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register/complete") {
    await handleAuthRegister(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password/send-code") {
    await handleAuthPasswordSendCode(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    await handleAuthLogin(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/admin/verify-2fa") {
    await handleAdminTwoFactorVerify(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password/reset") {
    await handleAuthPasswordReset(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    await handleAuthLogout(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/local-agent-runner.mjs") {
    await serveLocalAgentRunner(req, res);
    return;
  }

  if (registeredToolMatch) {
    const dispatch = toolDispatchTable[registeredToolMatch.tool.name];
    if (typeof dispatch === "function") {
      await dispatch(req, res, registeredToolMatch.params || {});
      return;
    }
  }

  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "\u65b9\u6cd5\u4e0d\u88ab\u5141\u8bb8\u3002" });
};

const server = httpsEnabled
  ? createHttpsServer(
      {
        key: readFileSync(httpsKeyPath),
        cert: readFileSync(httpsCertPath)
      },
      requestHandler
    )
  : createHttpServer(requestHandler);

server.listen(port, () => {
  const protocol = httpsEnabled ? "https" : "http";
  console.log(
    `Hegel Salon listening on ${protocol}://localhost:${port} (auth=${authEnabled ? "on" : "off"})`
  );
});
