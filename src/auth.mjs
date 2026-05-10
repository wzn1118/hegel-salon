import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import { sendMail } from "./mailDelivery.mjs";
import {
  insertSecurityAlertToDb,
  insertSecurityAuditEventToDb,
  markSecurityAlertEmailedInDb,
  insertSessionToDb,
  listRecentSecurityAlertsFromDb,
  purgeExpiredSessionsFromDb,
  readSessionByTokenHashFromDb,
  revokeSessionInDb,
  revokeSessionsByUserIdInDb,
  readAllEmailCodesFromDb,
  readAllSessionsFromDb,
  readAllUsersFromDb,
  replaceAllEmailCodesInDb,
  replaceAllUsersInDb,
  updateSessionActivityInDb
} from "./userDatabase.mjs";

const SESSION_COOKIE = "hegel_salon_session";
const CSRF_COOKIE = "hegel_salon_csrf";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const CODE_TTL_MS = 1000 * 60 * 10;

function normalizeWhitespace(text) {
  return String(text || "").trim();
}

function requirePlainString(value, fieldName, { min = 0, max = 512, allowEmpty = true } = {}) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const normalized = normalizeWhitespace(value);
  if (!allowEmpty && !normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  if (normalized.length < min) {
    throw new Error(`${fieldName} is too short.`);
  }

  if (normalized.length > max) {
    throw new Error(`${fieldName} is too long.`);
  }

  return normalized;
}

function normalizeEmail(email) {
  return normalizeWhitespace(email).toLowerCase();
}

function normalizeAccount(account) {
  return normalizeWhitespace(account)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 32);
}

function validateLoginIdentifier(login) {
  const normalized = requirePlainString(login, "Login", {
    min: 3,
    max: 256,
    allowEmpty: false
  }).toLowerCase();

  if (normalized.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error("Login email is invalid.");
    }
    return normalized;
  }

  if (!/^[a-z0-9._-]{3,32}$/.test(normalized)) {
    throw new Error("Login account contains invalid characters.");
  }

  return normalized;
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase() === "admin" ? "admin" : "user";
}

function parseConfiguredIdentitySet(rawValue, normalizer) {
  return new Set(
    String(rawValue || "")
      .split(",")
      .map((item) => normalizer(item))
      .filter(Boolean)
  );
}

function getConfiguredAdminAccounts() {
  return parseConfiguredIdentitySet(process.env.HEGEL_ADMIN_ACCOUNTS, normalizeAccount);
}

function getConfiguredAdminEmails() {
  return parseConfiguredIdentitySet(process.env.HEGEL_ADMIN_EMAILS, normalizeEmail);
}

function getBootstrapAdminConfig() {
  const account = normalizeAccount(process.env.HEGEL_ADMIN_ACCOUNT || "");
  const email = normalizeEmail(process.env.HEGEL_ADMIN_EMAIL || "");
  const password = String(process.env.HEGEL_ADMIN_PASSWORD || "");

  if (!account || !email || password.length < 8) {
    return null;
  }

  return {
    account,
    email,
    password
  };
}

function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function derivePasswordHash(password, salt) {
  return scryptSync(String(password || ""), salt, 64).toString("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    account: user.account,
    email: user.email,
    role: normalizeRole(user.role),
    disabledAt: user.disabledAt || null,
    verifiedAt: user.verifiedAt || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

function isAdminTwoFactorEnabled() {
  return process.env.HEGEL_ADMIN_2FA_DISABLED !== "1";
}

function isAdminTwoFactorRequiredForUser(user) {
  return isAdminUser(user) && isAdminTwoFactorEnabled();
}

function buildSecurityEventBase({
  userId = null,
  loginIdentifier = null,
  ipAddress = null,
  userAgent = null,
  route = null,
  details = {}
} = {}) {
  return {
    userId,
    loginIdentifier,
    ipAddress,
    userAgent,
    route,
    details,
    createdAt: new Date().toISOString()
  };
}

export function recordSecurityAuditEvent({
  eventType,
  severity = "info",
  userId = null,
  loginIdentifier = null,
  ipAddress = null,
  userAgent = null,
  route = null,
  details = {}
} = {}) {
  try {
    insertSecurityAuditEventToDb({
      eventType: String(eventType || "unknown"),
      severity,
      ...buildSecurityEventBase({
        userId,
        loginIdentifier,
        ipAddress,
        userAgent,
        route,
        details
      })
    });
    return true;
  } catch {
    return false;
  }
}

async function getSecurityAlertRecipients() {
  const configured = [...getConfiguredAdminEmails()].filter(Boolean);
  if (configured.length) {
    return configured;
  }

  const { users } = await readUsersStore();
  return users
    .filter((user) => isAdminUser(user) && user.email)
    .map((user) => user.email);
}

export async function recordSecurityAlert({
  alertType,
  severity = "warning",
  userId = null,
  loginIdentifier = null,
  ipAddress = null,
  userAgent = null,
  route = null,
  message = "",
  details = {}
} = {}) {
  const base = buildSecurityEventBase({
    userId,
    loginIdentifier,
    ipAddress,
    userAgent,
    route,
    details
  });
  recordSecurityAuditEvent({
    eventType: `alert:${alertType || "unknown"}`,
    severity,
    ...base
  });

  const dedupeWindowMs = 10 * 60 * 1000;
  const recentAlerts = listRecentSecurityAlertsFromDb(50);
  const duplicate = recentAlerts.find((item) =>
    item.alertType === String(alertType || "unknown") &&
    String(item.loginIdentifier || "") === String(loginIdentifier || "") &&
    String(item.ipAddress || "") === String(ipAddress || "") &&
    Date.now() - new Date(item.createdAt || 0).getTime() < dedupeWindowMs
  );
  if (duplicate) {
    return duplicate.id;
  }

  const alertId = insertSecurityAlertToDb({
    alertType: String(alertType || "unknown"),
    severity,
    userId,
    loginIdentifier,
    ipAddress,
    route,
    message,
    details,
    createdAt: base.createdAt
  });

  const recipients = await getSecurityAlertRecipients();
  if (!recipients.length) {
    return alertId;
  }

  try {
    await sendMail({
      to: recipients.join(", "),
      subject: `[Hegel Security Alert] ${String(alertType || "unknown")}`,
      text: [
        `Severity: ${severity}`,
        `Message: ${message}`,
        `Login: ${loginIdentifier || "-"}`,
        `IP: ${ipAddress || "-"}`,
        `Route: ${route || "-"}`,
        `Details: ${JSON.stringify(details || {})}`,
        `Time: ${base.createdAt}`
      ].join("\n")
    });
    markSecurityAlertEmailedInDb(alertId, new Date().toISOString());
  } catch {
    // Keep authentication flow resilient if alert delivery fails.
  }

  return alertId;
}

function parseCookieHeader(rawCookie = "") {
  const pairs = String(rawCookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const cookieMap = {};

  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    cookieMap[key] = decodeURIComponent(value);
  }

  return cookieMap;
}

function isHttpsRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return Boolean(req.socket?.encrypted) || forwardedProto === "https";
}

async function readUsersStore() {
  const rawUsers = readAllUsersFromDb();
  const configuredAdminAccounts = getConfiguredAdminAccounts();
  const configuredAdminEmails = getConfiguredAdminEmails();
  const bootstrapAdmin = getBootstrapAdminConfig();
  let changed = false;

  const users = rawUsers.map((user) => {
    const normalized = {
      ...user,
      id: String(user?.id || randomUUID()),
      account: normalizeAccount(user?.account || ""),
      email: normalizeEmail(user?.email || ""),
      role: normalizeRole(user?.role),
      disabledAt: user?.disabledAt || null,
      verifiedAt: user?.verifiedAt || null,
      createdAt: user?.createdAt || new Date().toISOString(),
      lastLoginAt: user?.lastLoginAt || null
    };

    const shouldBeAdmin =
      configuredAdminAccounts.has(normalized.account) ||
      configuredAdminEmails.has(normalized.email);

    if (shouldBeAdmin && normalized.role !== "admin") {
      normalized.role = "admin";
      changed = true;
    }

    if (
      normalized.id !== user?.id ||
      normalized.account !== user?.account ||
      normalized.email !== user?.email ||
      normalized.role !== normalizeRole(user?.role) ||
      normalized.disabledAt !== (user?.disabledAt || null) ||
      normalized.verifiedAt !== (user?.verifiedAt || null) ||
      normalized.createdAt !== (user?.createdAt || normalized.createdAt) ||
      normalized.lastLoginAt !== (user?.lastLoginAt || null)
    ) {
      changed = true;
    }

    return normalized;
  });

  if (
    bootstrapAdmin &&
    !users.some(
      (user) => user.account === bootstrapAdmin.account || user.email === bootstrapAdmin.email
    )
  ) {
    const passwordSalt = randomBytes(16).toString("hex");
    users.push({
      id: randomUUID(),
      account: bootstrapAdmin.account,
      email: bootstrapAdmin.email,
      passwordSalt,
      passwordHash: derivePasswordHash(bootstrapAdmin.password, passwordSalt),
      role: "admin",
      disabledAt: null,
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    });
    changed = true;
  }

  if (changed) {
    await writeUsersStore({ users });
  }

  return { users };
}

async function writeUsersStore(store) {
  replaceAllUsersInDb(Array.isArray(store.users) ? store.users : []);
}

async function readSessionsStore() {
  const now = Date.now();
  const sessions = readAllSessionsFromDb();
  const filtered = sessions.filter((item) => new Date(item.expiresAt || 0).getTime() > now);

  if (filtered.length !== sessions.length) {
    purgeExpiredSessionsFromDb(new Date(now).toISOString());
  }

  return { sessions: filtered };
}

async function writeSessionsStore(store) {
  const nextSessions = Array.isArray(store.sessions) ? store.sessions : [];
  purgeExpiredSessionsFromDb(new Date(0).toISOString());
  nextSessions.forEach((session) => insertSessionToDb(session));
}

async function readCodesStore() {
  const now = Date.now();
  const codes = readAllEmailCodesFromDb();
  const filtered = codes.filter((item) => new Date(item.expiresAt || 0).getTime() > now);

  if (filtered.length !== codes.length) {
    replaceAllEmailCodesInDb(filtered);
  }

  return { codes: filtered };
}

async function writeCodesStore(store) {
  replaceAllEmailCodesInDb(Array.isArray(store.codes) ? store.codes : []);
}

function validateRegistrationInput({ account, email, password }) {
  const normalizedAccount = normalizeAccount(
    requirePlainString(account, "Account", { min: 3, max: 64, allowEmpty: false })
  );
  const normalizedEmail = normalizeEmail(
    requirePlainString(email, "Email", { min: 3, max: 256, allowEmpty: false })
  );
  const normalizedPassword = requirePlainString(password, "Password", {
    min: 8,
    max: 256,
    allowEmpty: false
  });

  if (normalizedAccount.length < 3) {
    throw new Error("Account must be at least 3 characters and use letters, numbers, dot, dash, or underscore.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Please provide a valid email address.");
  }

  if (normalizedPassword && normalizedPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  return {
    account: normalizedAccount,
    email: normalizedEmail,
    password: normalizedPassword
  };
}

export function isAuthEnabled() {
  return (
    process.env.HEGEL_ENABLE_AUTH === "1" ||
    process.env.HEGEL_V4_AUTH === "1" ||
    Boolean(String(process.env.HEGEL_PUBLIC_BASE_URL || "").trim())
  );
}

export function getAuthCookieName() {
  return SESSION_COOKIE;
}

export function getCsrfCookieName() {
  return CSRF_COOKIE;
}

export function isAdminUser(user) {
  return normalizeRole(user?.role) === "admin";
}

export async function sendRegistrationCode({ account, email }) {
  const validated = validateRegistrationInput({ account, email, password: "placeholder-123" });
  const usersStore = await readUsersStore();

  if (
    usersStore.users.some(
      (item) => item.account === validated.account || item.email === validated.email
    )
  ) {
    throw new Error("That account or email is already registered.");
  }

  const code = String(randomInt(100000, 999999));
  const codesStore = await readCodesStore();
  const nextCodes = codesStore.codes.filter(
    (item) => !(item.purpose === "register" && item.email === validated.email)
  );

  nextCodes.push({
    id: randomUUID(),
    purpose: "register",
    account: validated.account,
    email: validated.email,
    codeHash: hashToken(code),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString()
  });

  await writeCodesStore({ codes: nextCodes });
  const delivery = await sendMail({
    to: validated.email,
    subject: "Hegel Salon verification code",
    text: `Your Hegel Salon verification code is ${code}. It expires in 10 minutes.`
  });

  return {
    ok: true,
    deliveryMode: delivery.mode,
    devCode:
      delivery.mode === "console" &&
      !String(process.env.HEGEL_PUBLIC_BASE_URL || "").trim() &&
      process.env.HEGEL_HIDE_DEV_CODES !== "1"
        ? code
        : undefined
  };
}

export async function sendPasswordResetCode({ login }) {
  const normalizedLogin = validateLoginIdentifier(login);
  const usersStore = await readUsersStore();
  const user = usersStore.users.find(
    (item) => item.account === normalizedLogin || item.email === normalizedLogin
  );

  if (!user || user.disabledAt || !user.verifiedAt) {
    return {
      ok: true,
      deliveryMode: "silent"
    };
  }

  const code = String(randomInt(100000, 999999));
  const codesStore = await readCodesStore();
  const nextCodes = codesStore.codes.filter(
    (item) => !(item.purpose === "reset_password" && item.email === user.email)
  );

  nextCodes.push({
    id: randomUUID(),
    purpose: "reset_password",
    account: user.account,
    email: user.email,
    codeHash: hashToken(code),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString()
  });

  await writeCodesStore({ codes: nextCodes });
  const delivery = await sendMail({
    to: user.email,
    subject: "Hegel Salon password reset code",
    text: `Your Hegel Salon password reset code is ${code}. It expires in 10 minutes.`
  });

  return {
    ok: true,
    deliveryMode: delivery.mode,
    devCode:
      delivery.mode === "console" &&
      !String(process.env.HEGEL_PUBLIC_BASE_URL || "").trim() &&
      process.env.HEGEL_HIDE_DEV_CODES !== "1"
        ? code
        : undefined
  };
}

export async function completeRegistration({ account, email, password, code }) {
  const validated = validateRegistrationInput({ account, email, password });
  const normalizedCode = requirePlainString(code, "Verification code", {
    min: 6,
    max: 6,
    allowEmpty: false
  });

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Please enter the 6-digit verification code.");
  }

  const [usersStore, codesStore] = await Promise.all([readUsersStore(), readCodesStore()]);

  if (
    usersStore.users.some(
      (item) => item.account === validated.account || item.email === validated.email
    )
  ) {
    throw new Error("That account or email is already registered.");
  }

  const challenge = codesStore.codes.find(
    (item) =>
      item.purpose === "register" &&
      item.account === validated.account &&
      item.email === validated.email &&
      safeEqual(item.codeHash, hashToken(normalizedCode))
  );

  if (!challenge) {
    throw new Error("The verification code is invalid or expired.");
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const user = {
    id: randomUUID(),
    account: validated.account,
    email: validated.email,
    passwordSalt,
    passwordHash: derivePasswordHash(validated.password, passwordSalt),
    role:
      getConfiguredAdminAccounts().has(validated.account) ||
      getConfiguredAdminEmails().has(validated.email)
        ? "admin"
        : "user",
    disabledAt: null,
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };

  await writeUsersStore({
    users: [...usersStore.users, user]
  });

  await writeCodesStore({
    codes: codesStore.codes.filter((item) => item.id !== challenge.id)
  });

  return sanitizeUser(user);
}

export async function resetPasswordWithCode({ login, code, password }) {
  const normalizedLogin = validateLoginIdentifier(login);
  const normalizedCode = requirePlainString(code, "Verification code", {
    min: 6,
    max: 6,
    allowEmpty: false
  });
  const normalizedPassword = requirePlainString(password, "Password", {
    min: 8,
    max: 256,
    allowEmpty: false
  });

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Please enter the 6-digit verification code.");
  }

  const [usersStore, codesStore] = await Promise.all([readUsersStore(), readCodesStore()]);
  const user = usersStore.users.find(
    (item) => item.account === normalizedLogin || item.email === normalizedLogin
  );

  if (!user || user.disabledAt) {
    throw new Error("Invalid reset request.");
  }

  const challenge = codesStore.codes.find(
    (item) =>
      item.purpose === "reset_password" &&
      item.email === user.email &&
      safeEqual(item.codeHash, hashToken(normalizedCode))
  );

  if (!challenge) {
    throw new Error("The verification code is invalid or expired.");
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const updatedUsers = usersStore.users.map((item) =>
    item.id === user.id
      ? {
          ...item,
          passwordSalt,
          passwordHash: derivePasswordHash(normalizedPassword, passwordSalt)
        }
      : item
  );

  await writeUsersStore({ users: updatedUsers });
  await writeCodesStore({
    codes: codesStore.codes.filter(
      (item) =>
        item.id !== challenge.id &&
        !(item.purpose === "reset_password" && item.email === user.email)
    )
  });
  await revokeUserSessions(user.id);

  return {
    ok: true
  };
}

async function verifyPrimaryCredentials(login, password) {
  const usersStore = await readUsersStore();
  const normalizedLogin = validateLoginIdentifier(login);
  const normalizedPassword = requirePlainString(password, "Password", {
    min: 8,
    max: 256,
    allowEmpty: false
  });
  const user = usersStore.users.find(
    (item) => item.account === normalizedLogin || item.email === normalizedLogin
  );

  if (!user) {
    throw new Error("Invalid account or password.");
  }

  const expectedHash = derivePasswordHash(normalizedPassword, user.passwordSalt);
  if (!safeEqual(expectedHash, user.passwordHash)) {
    throw new Error("Invalid account or password.");
  }

  if (!user.verifiedAt) {
    throw new Error("This account has not been verified.");
  }

  if (user.disabledAt) {
    throw new Error("This account has been disabled.");
  }

  return {
    user,
    normalizedLogin
  };
}

async function issueSessionForUser(user, { ipAddress = null, userAgent = null } = {}) {
  const usersStore = await readUsersStore();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const session = {
    id: randomUUID(),
    tokenHash,
    userId: user.id,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    ipAddress,
    userAgent
  };

  insertSessionToDb(session);

  await writeUsersStore({
    users: usersStore.users.map((item) =>
      item.id === user.id
        ? {
            ...item,
            lastLoginAt: new Date().toISOString()
          }
        : item
      )
  });

  return {
    token,
    user: sanitizeUser({
      ...user,
      lastLoginAt: new Date().toISOString()
    })
  };
}

export async function beginAdminTwoFactorLogin({
  login,
  password,
  ipAddress = null,
  userAgent = null,
  route = "/api/auth/login"
}) {
  const { user, normalizedLogin } = await verifyPrimaryCredentials(login, password);
  if (!isAdminTwoFactorRequiredForUser(user)) {
    return {
      requiresTwoFactor: false,
      user: sanitizeUser(user),
      normalizedLogin
    };
  }

  const code = String(randomInt(100000, 999999));
  const codesStore = await readCodesStore();
  const nextCodes = codesStore.codes.filter(
    (item) => !(item.purpose === "admin_login" && item.email === user.email)
  );
  nextCodes.push({
    id: randomUUID(),
    purpose: "admin_login",
    account: user.account,
    email: user.email,
    codeHash: hashToken(code),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString()
  });
  await writeCodesStore({ codes: nextCodes });
  const delivery = await sendMail({
    to: user.email,
    subject: "Hegel Admin login verification code",
    text: `Your Hegel Admin login code is ${code}. It expires in 10 minutes.`
  });
  recordSecurityAuditEvent({
    eventType: "admin_2fa_challenge_issued",
    severity: "info",
    userId: user.id,
    loginIdentifier: normalizedLogin,
    ipAddress,
    userAgent,
    route,
    details: { deliveryMode: delivery.mode }
  });

  return {
    requiresTwoFactor: true,
    user: sanitizeUser(user),
    normalizedLogin,
    deliveryMode: delivery.mode,
    devCode:
      delivery.mode === "console" &&
      !String(process.env.HEGEL_PUBLIC_BASE_URL || "").trim() &&
      process.env.HEGEL_HIDE_DEV_CODES !== "1"
        ? code
        : undefined
  };
}

export async function verifyAdminTwoFactorLogin({
  login,
  code,
  ipAddress = null,
  userAgent = null,
  route = "/api/auth/admin/verify-2fa"
}) {
  const normalizedLogin = validateLoginIdentifier(login);
  const normalizedCode = requirePlainString(code, "Verification code", {
    min: 6,
    max: 6,
    allowEmpty: false
  });
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Please enter the 6-digit verification code.");
  }

  const [usersStore, codesStore] = await Promise.all([readUsersStore(), readCodesStore()]);
  const user = usersStore.users.find(
    (item) => item.account === normalizedLogin || item.email === normalizedLogin
  );

  if (!user || !isAdminTwoFactorRequiredForUser(user)) {
    throw new Error("Two-factor verification is not available for this account.");
  }

  const challenge = codesStore.codes.find(
    (item) =>
      item.purpose === "admin_login" &&
      item.email === user.email &&
      safeEqual(item.codeHash, hashToken(normalizedCode))
  );

  if (!challenge) {
    recordSecurityAuditEvent({
      eventType: "admin_2fa_failed",
      severity: "warning",
      userId: user.id,
      loginIdentifier: normalizedLogin,
      ipAddress,
      userAgent,
      route,
      details: { reason: "invalid_code" }
    });
    throw new Error("The verification code is invalid or expired.");
  }

  await writeCodesStore({
    codes: codesStore.codes.filter(
      (item) => item.id !== challenge.id && !(item.purpose === "admin_login" && item.email === user.email)
    )
  });

  const session = await issueSessionForUser(user, { ipAddress, userAgent });
  recordSecurityAuditEvent({
    eventType: "admin_2fa_verified",
    severity: "info",
    userId: user.id,
    loginIdentifier: normalizedLogin,
    ipAddress,
    userAgent,
    route,
    details: {}
  });
  return session;
}

export async function loginUser({ login, password, ipAddress = null, userAgent = null }) {
  const { user, normalizedLogin } = await verifyPrimaryCredentials(login, password);
  const session = await issueSessionForUser(user, { ipAddress, userAgent });
  return {
    ...session,
    normalizedLogin
  };
}

export async function getSessionFromRequest(req) {
  if (!isAuthEnabled()) {
    return {
      enabled: false,
      user: null,
      session: null
    };
  }

  const cookies = parseCookieHeader(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return {
      enabled: true,
      user: null,
      session: null
    };
  }

  const hashed = hashToken(token);
  const session = readSessionByTokenHashFromDb(hashed);

  if (!session) {
    return {
      enabled: true,
      user: null,
      session: null
    };
  }

  const { users } = await readUsersStore();
  const user = users.find((item) => item.id === session.userId);
  if (!user || user.disabledAt) {
    revokeSessionInDb(session.id, "invalid_user");
    return {
      enabled: true,
      user: null,
      session: null
    };
  }

  updateSessionActivityInDb(session.id, new Date().toISOString());

  return {
    enabled: true,
    user: sanitizeUser(user),
    session
  };
}

export async function logoutRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return;
  }

  const hashed = hashToken(token);
  const session = readSessionByTokenHashFromDb(hashed);
  if (session?.id) {
    revokeSessionInDb(session.id, "logout");
  }
}

export async function listUsersForAdmin() {
  const [usersStore, sessionsStore] = await Promise.all([readUsersStore(), readSessionsStore()]);

  return usersStore.users.map((user) => {
    const sessions = sessionsStore.sessions
      .filter((session) => session.userId === user.id)
      .sort((left, right) => String(right.lastSeenAt || "").localeCompare(String(left.lastSeenAt || "")));

    return {
      ...sanitizeUser(user),
      sessionCount: sessions.length,
      lastSeenAt: sessions[0]?.lastSeenAt || null
    };
  });
}

export async function setUserDisabled(userId, disabled) {
  const usersStore = await readUsersStore();
  let updatedUser = null;

  const users = usersStore.users.map((user) => {
    if (user.id !== userId) {
      return user;
    }

    updatedUser = {
      ...user,
      disabledAt: disabled ? new Date().toISOString() : null
    };
    return updatedUser;
  });

  if (!updatedUser) {
    throw new Error("User not found.");
  }

  await writeUsersStore({ users });
  return sanitizeUser(updatedUser);
}

export async function revokeUserSessions(userId) {
  return {
    revoked: revokeSessionsByUserIdInDb(userId, "admin_revoke")
  };
}

export function buildSessionCookie(token, req) {
  const secure = isHttpsRequest(req) || process.env.HEGEL_FORCE_SECURE_COOKIES === "1";
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Priority=High",
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildClearedSessionCookie(req) {
  const secure = isHttpsRequest(req) || process.env.HEGEL_FORCE_SECURE_COOKIES === "1";
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Strict",
    "Priority=High",
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildCsrfCookie(token, req) {
  const secure = isHttpsRequest(req) || process.env.HEGEL_FORCE_SECURE_COOKIES === "1";
  return [
    `${CSRF_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "SameSite=Strict",
    "Priority=High",
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}
