import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { authDir, usersDir } from "./runtimeScope.mjs";

const dbPath = join(authDir, "hegel-users.sqlite");
const backupDir = join(authDir, "backups");
const apiConfigKeyPath = join(authDir, "api-config.key");
const API_KEY_ENCRYPTION_PREFIX = "enc:v1:";

mkdirSync(authDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = FULL;");
db.exec("PRAGMA busy_timeout = 10000;");
db.exec("PRAGMA wal_autocheckpoint = 1000;");
db.exec("PRAGMA temp_store = MEMORY;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    disabled_at TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS email_codes (
    id TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    account TEXT NOT NULL,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_api_configs (
    user_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    base_url TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS style_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    style_key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    user_style_prompt TEXT NOT NULL DEFAULT '',
    trained_style_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, style_key)
  );

  CREATE TABLE IF NOT EXISTS user_memory_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    memory_scope TEXT NOT NULL DEFAULT 'default',
    style_profile_id TEXT NOT NULL DEFAULT 'default',
    created_at TEXT NOT NULL,
    user_message_json TEXT NOT NULL,
    assistant_message_json TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    memory_scope TEXT NOT NULL DEFAULT 'default',
    style_profile_id TEXT NOT NULL DEFAULT 'default',
    chat_session_id TEXT NOT NULL DEFAULT 'default',
    created_at TEXT NOT NULL,
    history_json TEXT NOT NULL,
    reply_text TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    style_profile_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    memory_summary_text TEXT NOT NULL DEFAULT '',
    memory_source_message_count INTEGER NOT NULL DEFAULT 0,
    memory_updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    style_profile_id TEXT NOT NULL DEFAULT 'default',
    ordinal INTEGER NOT NULL,
    role TEXT NOT NULL,
    content_text TEXT NOT NULL DEFAULT '',
    attachments_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    UNIQUE(chat_session_id, ordinal)
  );

  CREATE TABLE IF NOT EXISTS style_memory_profiles (
    style_profile_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    summary_text TEXT NOT NULL DEFAULT '',
    source_turn_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (style_profile_id) REFERENCES style_profiles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_memory_profiles (
    user_id TEXT PRIMARY KEY,
    summary_text TEXT NOT NULL DEFAULT '',
    source_turn_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    login_identifier TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    status TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS security_audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    user_id TEXT,
    login_identifier TEXT,
    ip_address TEXT,
    user_agent TEXT,
    route TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS security_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    user_id TEXT,
    login_identifier TEXT,
    ip_address TEXT,
    route TEXT,
    message TEXT NOT NULL,
    details_json TEXT,
    email_sent_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS training_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    style_profile_id TEXT NOT NULL DEFAULT 'default',
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    pid INTEGER,
    iterations_target INTEGER NOT NULL,
    concurrency INTEGER NOT NULL,
    target_score REAL NOT NULL,
    timeout_ms INTEGER NOT NULL,
    progress_json TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS local_agent_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    token_hash TEXT NOT NULL UNIQUE,
    capabilities_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS local_agent_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    chat_session_id TEXT,
    style_profile_id TEXT NOT NULL DEFAULT 'default',
    task_type TEXT NOT NULL DEFAULT 'codex_exec',
    status TEXT NOT NULL,
    prompt_text TEXT NOT NULL DEFAULT '',
    command_json TEXT NOT NULL DEFAULT '{}',
    result_text TEXT NOT NULL DEFAULT '',
    error_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    claimed_at TEXT,
    finished_at TEXT,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES local_agent_devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_usage_daily (
    user_id TEXT NOT NULL,
    usage_day TEXT NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    chat_requests INTEGER NOT NULL DEFAULT 0,
    training_requests INTEGER NOT NULL DEFAULT 0,
    computer_requests INTEGER NOT NULL DEFAULT 0,
    admin_requests INTEGER NOT NULL DEFAULT 0,
    settings_requests INTEGER NOT NULL DEFAULT 0,
    total_duration_ms INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT,
    last_seen_at TEXT,
    PRIMARY KEY (user_id, usage_day),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email);
  CREATE INDEX IF NOT EXISTS idx_email_codes_expires_at ON email_codes(expires_at);
  CREATE INDEX IF NOT EXISTS idx_security_audit_events_created_at ON security_audit_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_security_audit_events_type_created_at ON security_audit_events(event_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at);
  CREATE INDEX IF NOT EXISTS idx_security_alerts_type_created_at ON security_alerts(alert_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_style_updated ON chat_sessions(user_id, style_profile_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_user_chat_messages_session_ordinal ON user_chat_messages(chat_session_id, ordinal);
  CREATE INDEX IF NOT EXISTS idx_local_agent_devices_user_seen ON local_agent_devices(user_id, last_seen_at);
  CREATE INDEX IF NOT EXISTS idx_local_agent_tasks_device_status ON local_agent_tasks(device_id, status, created_at);
  CREATE INDEX IF NOT EXISTS idx_local_agent_tasks_user_created ON local_agent_tasks(user_id, created_at);
`);

function ensureSafeSqlIdentifier(value, fieldName = "identifier") {
  const normalized = String(value || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return normalized;
}

function deriveApiConfigCryptoKey() {
  const envValue = String(process.env.HEGEL_API_CONFIG_MASTER_KEY || "").trim();
  if (envValue) {
    return createHash("sha256").update(envValue, "utf8").digest();
  }

  if (!existsSync(apiConfigKeyPath)) {
    writeFileSync(apiConfigKeyPath, randomBytes(32).toString("hex"), "utf8");
  }

  const stored = readFileSync(apiConfigKeyPath, "utf8").trim();
  return createHash("sha256").update(stored, "utf8").digest();
}

const apiConfigCryptoKey = deriveApiConfigCryptoKey();

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

function encryptApiKey(value) {
  const raw = String(value || "");
  if (!raw) {
    return "";
  }

  if (raw.startsWith(API_KEY_ENCRYPTION_PREFIX)) {
    return raw;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", apiConfigCryptoKey, iv);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${API_KEY_ENCRYPTION_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptApiKey(value) {
  const raw = String(value || "");
  if (!raw) {
    return "";
  }

  if (!raw.startsWith(API_KEY_ENCRYPTION_PREFIX)) {
    return raw;
  }

  const payload = raw.slice(API_KEY_ENCRYPTION_PREFIX.length);
  let parts = payload.split(".");
  if (parts.length === 4 && parts[0] === "") {
    parts = parts.slice(1);
  }
  if (parts.length !== 3) {
    if (payload.length > 38) {
      parts = [payload.slice(0, 16), payload.slice(16, 38), payload.slice(38)];
    } else {
      return "";
    }
  }

  try {
    const [ivEncoded, tagEncoded, encryptedEncoded] = parts;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      apiConfigCryptoKey,
      Buffer.from(ivEncoded, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, "base64url")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

function ensureColumn(tableName, columnName, sqlDefinition) {
  const safeTableName = ensureSafeSqlIdentifier(tableName, "tableName");
  const safeColumnName = ensureSafeSqlIdentifier(columnName, "columnName");
  const columns = db.prepare(`PRAGMA table_info(${safeTableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${safeTableName} ADD COLUMN ${safeColumnName} ${sqlDefinition}`);
}

ensureColumn("sessions", "ip_address", "TEXT");
ensureColumn("sessions", "user_agent", "TEXT");
ensureColumn("sessions", "revoked_at", "TEXT");
ensureColumn("sessions", "revoked_reason", "TEXT");
ensureColumn("user_memory_turns", "memory_scope", "TEXT NOT NULL DEFAULT 'default'");
ensureColumn("user_chat_logs", "memory_scope", "TEXT NOT NULL DEFAULT 'default'");
ensureColumn("user_memory_turns", "style_profile_id", "TEXT NOT NULL DEFAULT 'default'");
ensureColumn("user_chat_logs", "style_profile_id", "TEXT NOT NULL DEFAULT 'default'");
ensureColumn("user_memory_turns", "chat_session_id", "TEXT NOT NULL DEFAULT 'default'");
ensureColumn("user_chat_logs", "chat_session_id", "TEXT NOT NULL DEFAULT 'default'");
ensureColumn("training_runs", "style_profile_id", "TEXT NOT NULL DEFAULT 'default'");

function migratePlaintextApiKeysToEncrypted() {
  const rows = db.prepare(`
    SELECT user_id, api_key
    FROM user_api_configs
    WHERE api_key IS NOT NULL AND api_key != ''
  `).all();

  const pending = rows.filter((row) => {
    const value = String(row.api_key || "");
    return (
      value &&
      (
        !value.startsWith(API_KEY_ENCRYPTION_PREFIX) ||
        (value.startsWith(API_KEY_ENCRYPTION_PREFIX) &&
          value.slice(API_KEY_ENCRYPTION_PREFIX.length).split(".").length !== 3)
      )
    );
  });

  if (!pending.length) {
    return;
  }

  const update = db.prepare(`
    UPDATE user_api_configs
    SET api_key = ?
    WHERE user_id = ?
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    pending.forEach((row) => {
      const value = String(row.api_key || "");
      const normalized = value.startsWith(API_KEY_ENCRYPTION_PREFIX)
        ? encryptApiKey(decryptApiKey(value))
        : encryptApiKey(value);
      update.run(normalized, String(row.user_id || ""));
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

migratePlaintextApiKeysToEncrypted();

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_style_profiles_user_id ON style_profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_memory_turns_user_id_created_at ON user_memory_turns(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_memory_turns_user_style_created_at ON user_memory_turns(user_id, style_profile_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id_created_at ON user_chat_logs(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_logs_user_style_created_at ON user_chat_logs(user_id, style_profile_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_login_events_user_id_created_at ON login_events(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_training_runs_user_id_started_at ON training_runs(user_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_training_runs_user_style_started_at ON training_runs(user_id, style_profile_id, started_at);
`);

function defaultStyleProfileId(userId) {
  return `${String(userId || "").trim()}__default`;
}

export function getDefaultStyleProfileId(userId) {
  return defaultStyleProfileId(userId);
}

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeReadJson(path, fallback) {
  try {
    if (!existsSync(path)) {
      return fallback;
    }
    return parseJsonSafe(readFileSync(path, "utf8"), fallback);
  } catch {
    return fallback;
  }
}

function mapUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    account: row.account,
    email: row.email,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    role: row.role,
    disabledAt: row.disabled_at,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

function mapSessionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    tokenHash: row.token_hash,
    userId: row.user_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    ipAddress: row.ip_address || null,
    userAgent: row.user_agent || null,
    revokedAt: row.revoked_at || null,
    revokedReason: row.revoked_reason || null
  };
}

function mapCodeRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    purpose: row.purpose,
    account: row.account,
    email: row.email,
    codeHash: row.code_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

function mapMemoryTurnRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    styleProfileId: row.style_profile_id || "default",
    memoryScope: row.memory_scope || "default",
    chatSessionId: row.chat_session_id || "default",
    createdAt: row.created_at,
    userMessage: parseJsonSafe(row.user_message_json, {}),
    assistantMessage: parseJsonSafe(row.assistant_message_json, {})
  };
}

function mapChatLogRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    styleProfileId: row.style_profile_id || "default",
    memoryScope: row.memory_scope || "default",
    chatSessionId: row.chat_session_id || "default",
    createdAt: row.created_at,
    history: parseJsonSafe(row.history_json, []),
    reply: row.reply_text
  };
}

function mapChatSessionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    styleProfileId: row.style_profile_id || "default",
    title: row.title || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: Number(row.message_count || 0),
    memorySummaryText: row.memory_summary_text || "",
    memorySourceMessageCount: Number(row.memory_source_message_count || 0),
    memoryUpdatedAt: row.memory_updated_at || null
  };
}

function mapChatMessageRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    chatSessionId: row.chat_session_id,
    userId: row.user_id,
    styleProfileId: row.style_profile_id || "default",
    ordinal: Number(row.ordinal || 0),
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content_text || "",
    attachments: parseJsonSafe(row.attachments_json, []),
    createdAt: row.created_at
  };
}

function mapLocalAgentDeviceRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name || "",
    capabilities: parseJsonSafe(row.capabilities_json, {}),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at || null,
    revokedAt: row.revoked_at || null
  };
}

function mapLocalAgentTaskRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    chatSessionId: row.chat_session_id || null,
    styleProfileId: row.style_profile_id || "default",
    taskType: row.task_type || "codex_exec",
    status: row.status,
    promptText: row.prompt_text || "",
    command: parseJsonSafe(row.command_json, {}),
    resultText: row.result_text || "",
    errorText: row.error_text || "",
    createdAt: row.created_at,
    claimedAt: row.claimed_at || null,
    finishedAt: row.finished_at || null,
    expiresAt: row.expires_at
  };
}

function mapLoginEventRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id || null,
    loginIdentifier: row.login_identifier,
    ipAddress: row.ip_address || null,
    userAgent: row.user_agent || null,
    status: row.status,
    reason: row.reason || null,
    createdAt: row.created_at
  };
}

function mapSecurityAuditEventRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    eventType: row.event_type,
    severity: row.severity,
    userId: row.user_id || null,
    loginIdentifier: row.login_identifier || null,
    ipAddress: row.ip_address || null,
    userAgent: row.user_agent || null,
    route: row.route || null,
    details: parseJsonSafe(row.details_json, {}),
    createdAt: row.created_at
  };
}

function mapSecurityAlertRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    alertType: row.alert_type,
    severity: row.severity,
    userId: row.user_id || null,
    loginIdentifier: row.login_identifier || null,
    ipAddress: row.ip_address || null,
    route: row.route || null,
    message: row.message || "",
    details: parseJsonSafe(row.details_json, {}),
    emailSentAt: row.email_sent_at || null,
    createdAt: row.created_at
  };
}

function mapTrainingRunRow(row) {
  if (!row) {
    return null;
  }

  const progress = parseJsonSafe(row.progress_json, null);
  if (progress && typeof progress === "object") {
    if (Number(progress.averageScore || 0) > 10) {
      progress.averageScore = Number((Number(progress.averageScore || 0) / 10).toFixed(2));
    }
    if (Number(progress.successfulAverageScore || 0) > 10) {
      progress.successfulAverageScore = Number((Number(progress.successfulAverageScore || 0) / 10).toFixed(2));
    }
    if (progress.lastFailure && Number(progress.lastFailure.score || 0) > 10) {
      progress.lastFailure = {
        ...progress.lastFailure,
        score: Number((Number(progress.lastFailure.score || 0) / 10).toFixed(2))
      };
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    styleProfileId: row.style_profile_id || "default",
    startedAt: row.started_at,
    finishedAt: row.finished_at || null,
    status: row.status,
    pid: row.pid,
    iterationsTarget: row.iterations_target,
    concurrency: row.concurrency,
    targetScore: row.target_score,
    timeoutMs: row.timeout_ms,
    progress
  };
}

function mapUsageRow(row) {
  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    usageDay: row.usage_day,
    totalRequests: row.total_requests,
    chatRequests: row.chat_requests,
    trainingRequests: row.training_requests,
    computerRequests: row.computer_requests,
    adminRequests: row.admin_requests,
    settingsRequests: row.settings_requests,
    totalDurationMs: row.total_duration_ms,
    firstSeenAt: row.first_seen_at || null,
    lastSeenAt: row.last_seen_at || null
  };
}

function runReplaceTransaction(tableName, rows, insertCallback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`DELETE FROM ${tableName}`);
    rows.forEach(insertCallback);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateLegacyAuthJson() {
  const userCount = Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count || 0);
  const sessionCount = Number(db.prepare("SELECT COUNT(*) AS count FROM sessions").get().count || 0);
  const codeCount = Number(db.prepare("SELECT COUNT(*) AS count FROM email_codes").get().count || 0);

  if (userCount === 0) {
    const legacy = safeReadJson(join(authDir, "users.json"), { users: [] });
    const rows = Array.isArray(legacy.users) ? legacy.users : [];
    const insertUser = db.prepare(`
      INSERT INTO users (
        id, account, email, password_salt, password_hash, role,
        disabled_at, verified_at, created_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    runReplaceTransaction("users", rows, (user) => {
      insertUser.run(
        String(user?.id || ""),
        String(user?.account || ""),
        String(user?.email || ""),
        String(user?.passwordSalt || ""),
        String(user?.passwordHash || ""),
        String(user?.role || "user"),
        user?.disabledAt || null,
        user?.verifiedAt || null,
        String(user?.createdAt || ""),
        user?.lastLoginAt || null
      );
    });
  }

  if (sessionCount === 0) {
    const legacy = safeReadJson(join(authDir, "sessions.json"), { sessions: [] });
    const rows = Array.isArray(legacy.sessions) ? legacy.sessions : [];
    const insertSession = db.prepare(`
      INSERT INTO sessions (
        id, token_hash, user_id, created_at, last_seen_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    runReplaceTransaction("sessions", rows, (session) => {
      insertSession.run(
        String(session?.id || ""),
        String(session?.tokenHash || ""),
        String(session?.userId || ""),
        String(session?.createdAt || ""),
        String(session?.lastSeenAt || ""),
        String(session?.expiresAt || "")
      );
    });
  }

  if (codeCount === 0) {
    const legacy = safeReadJson(join(authDir, "email-codes.json"), { codes: [] });
    const rows = Array.isArray(legacy.codes) ? legacy.codes : [];
    const insertCode = db.prepare(`
      INSERT INTO email_codes (
        id, purpose, account, email, code_hash, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    runReplaceTransaction("email_codes", rows, (code) => {
      insertCode.run(
        String(code?.id || ""),
        String(code?.purpose || ""),
        String(code?.account || ""),
        String(code?.email || ""),
        String(code?.codeHash || ""),
        String(code?.createdAt || ""),
        String(code?.expiresAt || "")
      );
    });
  }
}

function migrateLegacyUserApiConfigs() {
  const configCount = Number(
    db.prepare("SELECT COUNT(*) AS count FROM user_api_configs").get().count || 0
  );
  if (configCount > 0 || !existsSync(usersDir)) {
    return;
  }

  const insertConfig = db.prepare(`
    INSERT OR REPLACE INTO user_api_configs (
      user_id, provider, model, base_url, api_key, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const userDirs = readdirSync(usersDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const entry of userDirs) {
      const configPath = join(usersDir, entry.name, "config", "api.json");
      if (!existsSync(configPath)) {
        continue;
      }

      const config = safeReadJson(configPath, {});
      insertConfig.run(
        entry.name,
        String(config?.provider || ""),
        String(config?.model || ""),
        String(config?.baseURL || config?.baseUrl || ""),
        String(config?.apiKey || ""),
        new Date().toISOString()
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateLegacyUserData() {
  const memoryCount = Number(
    db.prepare("SELECT COUNT(*) AS count FROM user_memory_turns").get().count || 0
  );
  const chatCount = Number(
    db.prepare("SELECT COUNT(*) AS count FROM user_chat_logs").get().count || 0
  );

  if (!existsSync(usersDir) || (memoryCount > 0 && chatCount > 0)) {
    return;
  }

  const insertStyle = db.prepare(`
    INSERT OR REPLACE INTO style_profiles (
      id, user_id, style_key, name, description, user_style_prompt,
      trained_style_summary, created_at, updated_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMemory = db.prepare(`
    INSERT INTO user_memory_turns (
      user_id, memory_scope, style_profile_id, created_at, user_message_json, assistant_message_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertChat = db.prepare(`
    INSERT INTO user_chat_logs (
      user_id, memory_scope, style_profile_id, created_at, history_json, reply_text
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const userDirs = readdirSync(usersDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const entry of userDirs) {
      const userId = entry.name;
      const styleId = defaultStyleProfileId(userId);
      insertStyle.run(
        styleId,
        userId,
        "default",
        "Default",
        "",
        "",
        "",
        new Date().toISOString(),
        new Date().toISOString(),
        null
      );
      if (memoryCount === 0) {
        const memoryPath = join(usersDir, userId, "logs", "memory-turns.jsonl");
        if (existsSync(memoryPath)) {
          const raw = readFileSync(memoryPath, "utf8");
          raw.split(/\r?\n/).filter(Boolean).forEach((line) => {
            const parsed = parseJsonSafe(String(line).replace(/^\uFEFF/, ""), null);
            if (!parsed) return;
            insertMemory.run(
              userId,
              "default",
              styleId,
              String(parsed.timestamp || new Date().toISOString()),
              JSON.stringify(parsed.user || {}),
              JSON.stringify(parsed.assistant || {})
            );
          });
        }
      }

      if (chatCount === 0) {
        const chatPath = join(usersDir, userId, "logs", "chat-history.jsonl");
        if (existsSync(chatPath)) {
          const raw = readFileSync(chatPath, "utf8");
          raw.split(/\r?\n/).filter(Boolean).forEach((line) => {
            const parsed = parseJsonSafe(String(line).replace(/^\uFEFF/, ""), null);
            if (!parsed) return;
            insertChat.run(
              userId,
              "default",
              styleId,
              String(parsed.timestamp || new Date().toISOString()),
              JSON.stringify(Array.isArray(parsed.history) ? parsed.history : []),
              String(parsed.reply || "")
            );
          });
        }
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateDefaultStyleProfileIds() {
  const users = db.prepare("SELECT id, created_at FROM users").all();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const user of users) {
      const styleId = ensureDefaultStyleProfileForUser(user.id, user.created_at || new Date().toISOString());
      db.prepare(`
        UPDATE user_memory_turns
        SET style_profile_id = ?
        WHERE user_id = ? AND style_profile_id = 'default'
      `).run(styleId, user.id);
      db.prepare(`
        UPDATE user_chat_logs
        SET style_profile_id = ?
        WHERE user_id = ? AND style_profile_id = 'default'
      `).run(styleId, user.id);
      db.prepare(`
        UPDATE training_runs
        SET style_profile_id = ?
        WHERE user_id = ? AND style_profile_id = 'default'
      `).run(styleId, user.id);
      db.prepare(`
        INSERT INTO style_memory_profiles (
          style_profile_id, user_id, summary_text, source_turn_count, updated_at
        )
        SELECT ?, user_id, summary_text, source_turn_count, updated_at
        FROM user_memory_profiles
        WHERE user_id = ?
        ON CONFLICT(style_profile_id) DO NOTHING
      `).run(styleId, user.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

migrateLegacyAuthJson();
migrateLegacyUserApiConfigs();
migrateLegacyUserData();
migrateDefaultStyleProfileIds();

export function readAllUsersFromDb() {
  return db.prepare(`
    SELECT
      id, account, email, password_salt, password_hash, role,
      disabled_at, verified_at, created_at, last_login_at
    FROM users
  `).all().map(mapUserRow);
}

export function ensureDefaultStyleProfileForUser(userId, createdAt = new Date().toISOString()) {
  const styleId = defaultStyleProfileId(userId);
  db.prepare(`
    INSERT INTO style_profiles (
      id, user_id, style_key, name, description, user_style_prompt,
      trained_style_summary, created_at, updated_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    styleId,
    String(userId || ""),
    "default",
    "Default",
    "",
    "",
    "",
    String(createdAt),
    String(createdAt),
    null
  );
  return styleId;
}

export function listStyleProfilesByUserId(userId) {
  return db.prepare(`
    SELECT
      id, user_id, style_key, name, description,
      user_style_prompt, trained_style_summary,
      created_at, updated_at, archived_at
    FROM style_profiles
    WHERE user_id = ? AND archived_at IS NULL
    ORDER BY created_at ASC
  `).all(String(userId || "")).map((row) => ({
    id: row.id,
    userId: row.user_id,
    styleKey: row.style_key,
    name: row.name,
    description: row.description || "",
    userStylePrompt: row.user_style_prompt || "",
    trainedStyleSummary: row.trained_style_summary || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || null
  }));
}

export function readStyleProfileById(userId, styleProfileId) {
  const row = db.prepare(`
    SELECT
      id, user_id, style_key, name, description,
      user_style_prompt, trained_style_summary,
      created_at, updated_at, archived_at
    FROM style_profiles
    WHERE user_id = ? AND id = ?
    LIMIT 1
  `).get(String(userId || ""), String(styleProfileId || ""));

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    styleKey: row.style_key,
    name: row.name,
    description: row.description || "",
    userStylePrompt: row.user_style_prompt || "",
    trainedStyleSummary: row.trained_style_summary || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || null
  };
}

export function insertStyleProfile(style = {}) {
  db.prepare(`
    INSERT INTO style_profiles (
      id, user_id, style_key, name, description,
      user_style_prompt, trained_style_summary,
      created_at, updated_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(style.id || ""),
    String(style.userId || ""),
    String(style.styleKey || ""),
    String(style.name || ""),
    String(style.description || ""),
    String(style.userStylePrompt || ""),
    String(style.trainedStyleSummary || ""),
    String(style.createdAt || new Date().toISOString()),
    String(style.updatedAt || new Date().toISOString()),
    style.archivedAt || null
  );
  return readStyleProfileById(style.userId, style.id);
}

export function updateStyleProfileById(userId, styleProfileId, fields = {}) {
  db.prepare(`
    UPDATE style_profiles
    SET name = COALESCE(?, name),
        description = COALESCE(?, description),
        user_style_prompt = COALESCE(?, user_style_prompt),
        trained_style_summary = COALESCE(?, trained_style_summary),
        updated_at = COALESCE(?, updated_at),
        archived_at = COALESCE(?, archived_at)
    WHERE user_id = ? AND id = ?
  `).run(
    fields.name ?? null,
    fields.description ?? null,
    fields.userStylePrompt ?? null,
    fields.trainedStyleSummary ?? null,
    fields.updatedAt ?? new Date().toISOString(),
    fields.archivedAt ?? null,
    String(userId || ""),
    String(styleProfileId || "")
  );
  return readStyleProfileById(userId, styleProfileId);
}

export function replaceAllUsersInDb(users = []) {
  const normalized = Array.isArray(users) ? users : [];
  const upsertUser = db.prepare(`
    INSERT INTO users (
      id, account, email, password_salt, password_hash, role,
      disabled_at, verified_at, created_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account = excluded.account,
      email = excluded.email,
      password_salt = excluded.password_salt,
      password_hash = excluded.password_hash,
      role = excluded.role,
      disabled_at = excluded.disabled_at,
      verified_at = excluded.verified_at,
      created_at = excluded.created_at,
      last_login_at = excluded.last_login_at
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    if (normalized.length) {
      const placeholders = normalized.map(() => "?").join(", ");
      db.prepare(`DELETE FROM users WHERE id NOT IN (${placeholders})`).run(
        ...normalized.map((user) => String(user?.id || ""))
      );
    } else {
      db.exec("DELETE FROM users");
    }

    normalized.forEach((user) => {
      upsertUser.run(
        String(user?.id || ""),
        String(user?.account || ""),
        String(user?.email || ""),
        String(user?.passwordSalt || ""),
        String(user?.passwordHash || ""),
        String(user?.role || "user"),
        user?.disabledAt || null,
        user?.verifiedAt || null,
        String(user?.createdAt || ""),
        user?.lastLoginAt || null
      );
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readAllSessionsFromDb() {
  return db.prepare(`
    SELECT
      id, token_hash, user_id, created_at, last_seen_at, expires_at,
      ip_address, user_agent, revoked_at, revoked_reason
    FROM sessions
  `).all().map(mapSessionRow);
}

export function replaceAllSessionsInDb(sessions = []) {
  const insertSession = db.prepare(`
    INSERT INTO sessions (
      id, token_hash, user_id, created_at, last_seen_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  runReplaceTransaction("sessions", sessions, (session) => {
    insertSession.run(
      String(session?.id || ""),
      String(session?.tokenHash || ""),
      String(session?.userId || ""),
      String(session?.createdAt || ""),
      String(session?.lastSeenAt || ""),
      String(session?.expiresAt || "")
    );
  });
}

export function insertSessionToDb(session) {
  db.prepare(`
    INSERT INTO sessions (
      id, token_hash, user_id, created_at, last_seen_at, expires_at,
      ip_address, user_agent, revoked_at, revoked_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(session?.id || ""),
    String(session?.tokenHash || ""),
    String(session?.userId || ""),
    String(session?.createdAt || ""),
    String(session?.lastSeenAt || ""),
    String(session?.expiresAt || ""),
    session?.ipAddress || null,
    session?.userAgent || null,
    session?.revokedAt || null,
    session?.revokedReason || null
  );
}

export function readSessionByTokenHashFromDb(tokenHash) {
  const row = db.prepare(`
    SELECT
      id, token_hash, user_id, created_at, last_seen_at, expires_at,
      ip_address, user_agent, revoked_at, revoked_reason
    FROM sessions
    WHERE token_hash = ?
    LIMIT 1
  `).get(String(tokenHash || ""));

  return mapSessionRow(row);
}

export function updateSessionActivityInDb(sessionId, lastSeenAt) {
  db.prepare(`
    UPDATE sessions
    SET last_seen_at = ?
    WHERE id = ?
  `).run(String(lastSeenAt || new Date().toISOString()), String(sessionId || ""));
}

export function revokeSessionInDb(sessionId, reason = "logout", revokedAt = new Date().toISOString()) {
  db.prepare(`
    UPDATE sessions
    SET revoked_at = ?, revoked_reason = ?
    WHERE id = ?
  `).run(String(revokedAt), String(reason || ""), String(sessionId || ""));

  db.prepare("DELETE FROM sessions WHERE id = ?").run(String(sessionId || ""));
}

export function revokeSessionsByUserIdInDb(userId, reason = "admin_revoke", revokedAt = new Date().toISOString()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE sessions
      SET revoked_at = ?, revoked_reason = ?
      WHERE user_id = ?
    `).run(String(revokedAt), String(reason || ""), String(userId || ""));
    const info = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(String(userId || ""));
    db.exec("COMMIT");
    return Number(info.changes || 0);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function purgeExpiredSessionsFromDb(nowIso = new Date().toISOString()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE sessions
      SET revoked_at = ?, revoked_reason = 'expired'
      WHERE expires_at <= ?
    `).run(String(nowIso), String(nowIso));
    const info = db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(String(nowIso));
    db.exec("COMMIT");
    return Number(info.changes || 0);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listSessionsByUserIdFromDb(userId, limit = 20) {
  return db.prepare(`
    SELECT
      id, token_hash, user_id, created_at, last_seen_at, expires_at,
      ip_address, user_agent, revoked_at, revoked_reason
    FROM sessions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(String(userId || ""), Math.max(1, Number(limit || 20))).map(mapSessionRow);
}

export function readAllEmailCodesFromDb() {
  return db.prepare(`
    SELECT id, purpose, account, email, code_hash, created_at, expires_at
    FROM email_codes
  `).all().map(mapCodeRow);
}

export function replaceAllEmailCodesInDb(codes = []) {
  const insertCode = db.prepare(`
    INSERT INTO email_codes (
      id, purpose, account, email, code_hash, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  runReplaceTransaction("email_codes", codes, (code) => {
    insertCode.run(
      String(code?.id || ""),
      String(code?.purpose || ""),
      String(code?.account || ""),
      String(code?.email || ""),
      String(code?.codeHash || ""),
      String(code?.createdAt || ""),
      String(code?.expiresAt || "")
    );
  });
}

export function readUserApiConfigFromDb(userId) {
  const row = db.prepare(`
    SELECT user_id, provider, model, base_url, api_key, updated_at
    FROM user_api_configs
    WHERE user_id = ?
  `).get(String(userId || ""));

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    provider: row.provider,
    model: row.model,
    baseURL: canonicalizeApiBaseURL(row.base_url, row.provider),
    apiKey: decryptApiKey(row.api_key),
    updatedAt: row.updated_at
  };
}

export function readUserMemoryProfileFromDb(userId, styleProfileId = null) {
  const styleId = String(styleProfileId || defaultStyleProfileId(userId));
  const row = db.prepare(`
    SELECT style_profile_id, user_id, summary_text, source_turn_count, updated_at
    FROM style_memory_profiles
    WHERE style_profile_id = ?
  `).get(String(styleId));

  if (!row) {
    return null;
  }

  return {
    styleProfileId: row.style_profile_id,
    userId: row.user_id,
    summaryText: row.summary_text || "",
    sourceTurnCount: Number(row.source_turn_count || 0),
    updatedAt: row.updated_at
  };
}

export function readUserLongTermMemoryProfileFromDb(userId) {
  const row = db.prepare(`
    SELECT user_id, summary_text, source_turn_count, updated_at
    FROM user_memory_profiles
    WHERE user_id = ?
  `).get(String(userId || ""));

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    summaryText: row.summary_text || "",
    sourceTurnCount: Number(row.source_turn_count || 0),
    updatedAt: row.updated_at
  };
}

export function writeUserMemoryProfileToDb(userId, styleProfileId, summaryText, sourceTurnCount, updatedAt = new Date().toISOString()) {
  const styleId = String(styleProfileId || defaultStyleProfileId(userId));
  db.prepare(`
    INSERT INTO style_memory_profiles (
      style_profile_id, user_id, summary_text, source_turn_count, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(style_profile_id) DO UPDATE SET
      summary_text = excluded.summary_text,
      source_turn_count = excluded.source_turn_count,
      updated_at = excluded.updated_at
  `).run(
    styleId,
    String(userId || ""),
    String(summaryText || ""),
    Number(sourceTurnCount || 0),
    String(updatedAt)
  );

  return readUserMemoryProfileFromDb(userId, styleId);
}

export function writeUserLongTermMemoryProfileToDb(userId, summaryText, sourceTurnCount, updatedAt = new Date().toISOString()) {
  db.prepare(`
    INSERT INTO user_memory_profiles (
      user_id, summary_text, source_turn_count, updated_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      summary_text = excluded.summary_text,
      source_turn_count = excluded.source_turn_count,
      updated_at = excluded.updated_at
  `).run(
    String(userId || ""),
    String(summaryText || ""),
    Number(sourceTurnCount || 0),
    String(updatedAt)
  );

  return readUserLongTermMemoryProfileFromDb(userId);
}


export function insertLoginEventToDb(event = {}) {
  db.prepare(`
    INSERT INTO login_events (
      user_id, login_identifier, ip_address, user_agent, status, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event?.userId || null,
    String(event?.loginIdentifier || ""),
    event?.ipAddress || null,
    event?.userAgent || null,
    String(event?.status || "unknown"),
    event?.reason || null,
    String(event?.createdAt || new Date().toISOString())
  );
}

export function insertSecurityAuditEventToDb(event = {}) {
  db.prepare(`
    INSERT INTO security_audit_events (
      event_type, severity, user_id, login_identifier, ip_address, user_agent,
      route, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(event?.eventType || "unknown"),
    String(event?.severity || "info"),
    event?.userId || null,
    event?.loginIdentifier || null,
    event?.ipAddress || null,
    event?.userAgent || null,
    event?.route || null,
    JSON.stringify(event?.details || {}),
    String(event?.createdAt || new Date().toISOString())
  );
}

export function listRecentSecurityAuditEventsFromDb(limit = 100) {
  return db.prepare(`
    SELECT
      id, event_type, severity, user_id, login_identifier, ip_address,
      user_agent, route, details_json, created_at
    FROM security_audit_events
    ORDER BY id DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit || 100))).map(mapSecurityAuditEventRow);
}

export function insertSecurityAlertToDb(alert = {}) {
  const result = db.prepare(`
    INSERT INTO security_alerts (
      alert_type, severity, user_id, login_identifier, ip_address,
      route, message, details_json, email_sent_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(alert?.alertType || "unknown"),
    String(alert?.severity || "warning"),
    alert?.userId || null,
    alert?.loginIdentifier || null,
    alert?.ipAddress || null,
    alert?.route || null,
    String(alert?.message || ""),
    JSON.stringify(alert?.details || {}),
    alert?.emailSentAt || null,
    String(alert?.createdAt || new Date().toISOString())
  );
  return Number(result.lastInsertRowid || 0);
}

export function markSecurityAlertEmailedInDb(alertId, emailSentAt = new Date().toISOString()) {
  db.prepare(`
    UPDATE security_alerts
    SET email_sent_at = ?
    WHERE id = ?
  `).run(String(emailSentAt), Number(alertId || 0));
}

export function listRecentSecurityAlertsFromDb(limit = 50) {
  return db.prepare(`
    SELECT
      id, alert_type, severity, user_id, login_identifier, ip_address,
      route, message, details_json, email_sent_at, created_at
    FROM security_alerts
    ORDER BY id DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit || 50))).map(mapSecurityAlertRow);
}

export function listLoginEventsByUserIdFromDb(userId, limit = 20) {
  return db.prepare(`
    SELECT id, user_id, login_identifier, ip_address, user_agent, status, reason, created_at
    FROM login_events
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(String(userId || ""), Math.max(1, Number(limit || 20))).map(mapLoginEventRow).reverse();
}

export function listRecentLoginEventsFromDb(limit = 50) {
  return db.prepare(`
    SELECT id, user_id, login_identifier, ip_address, user_agent, status, reason, created_at
    FROM login_events
    ORDER BY id DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit || 50))).map(mapLoginEventRow);
}

export function countLoginEventsByUserIdFromDb(userId) {
  return Number(
    db.prepare("SELECT COUNT(*) AS count FROM login_events WHERE user_id = ?").get(String(userId || "")).count || 0
  );
}

export function writeUserApiConfigToDb(userId, config = {}) {
  const provider = String(config.provider || "");
  const baseURL = canonicalizeApiBaseURL(String(config.baseURL || config.baseUrl || ""), provider);
  db.prepare(`
    INSERT INTO user_api_configs (
      user_id, provider, model, base_url, api_key, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      base_url = excluded.base_url,
      api_key = excluded.api_key,
      updated_at = excluded.updated_at
  `).run(
    String(userId || ""),
    provider,
    String(config.model || ""),
    baseURL,
    encryptApiKey(String(config.apiKey || "")),
    new Date().toISOString()
  );

  return readUserApiConfigFromDb(userId);
}

export function getUserDatabasePath() {
  return dbPath;
}

export function getUserDatabaseBackupDir() {
  return backupDir;
}

export function getUserDatabaseHealth() {
  const integrityRows = db.prepare("PRAGMA integrity_check").all();
  const integrity = Array.isArray(integrityRows) && integrityRows.length
    ? Object.values(integrityRows[0])[0]
    : "unknown";
  const pragmaValue = (sql, key) => {
    const row = db.prepare(sql).get();
    return row?.[key] ?? null;
  };

  return {
    path: dbPath,
    backupDir,
    integrity,
    pragmas: {
      journalMode: pragmaValue("PRAGMA journal_mode", "journal_mode"),
      synchronous: pragmaValue("PRAGMA synchronous", "synchronous"),
      busyTimeout: pragmaValue("PRAGMA busy_timeout", "timeout"),
      walAutocheckpoint: pragmaValue("PRAGMA wal_autocheckpoint", "wal_autocheckpoint"),
      foreignKeys: pragmaValue("PRAGMA foreign_keys", "foreign_keys"),
      tempStore: pragmaValue("PRAGMA temp_store", "temp_store")
    },
    counts: {
      users: Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count || 0),
      sessions: Number(db.prepare("SELECT COUNT(*) AS count FROM sessions").get().count || 0),
      emailCodes: Number(db.prepare("SELECT COUNT(*) AS count FROM email_codes").get().count || 0),
      apiConfigs: Number(db.prepare("SELECT COUNT(*) AS count FROM user_api_configs").get().count || 0),
      memoryTurns: Number(db.prepare("SELECT COUNT(*) AS count FROM user_memory_turns").get().count || 0),
      chatLogs: Number(db.prepare("SELECT COUNT(*) AS count FROM user_chat_logs").get().count || 0),
      memoryProfiles: Number(db.prepare("SELECT COUNT(*) AS count FROM style_memory_profiles").get().count || 0),
      longTermMemoryProfiles: Number(db.prepare("SELECT COUNT(*) AS count FROM user_memory_profiles").get().count || 0),
      loginEvents: Number(db.prepare("SELECT COUNT(*) AS count FROM login_events").get().count || 0),
      securityAuditEvents: Number(db.prepare("SELECT COUNT(*) AS count FROM security_audit_events").get().count || 0),
      securityAlerts: Number(db.prepare("SELECT COUNT(*) AS count FROM security_alerts").get().count || 0),
      trainingRuns: Number(db.prepare("SELECT COUNT(*) AS count FROM training_runs").get().count || 0),
      usageRows: Number(db.prepare("SELECT COUNT(*) AS count FROM user_usage_daily").get().count || 0)
    }
  };
}

export function createUserDatabaseBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(backupDir, `hegel-users-backup-${stamp}.sqlite`);
  const escapedPath = path.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}'`);
  return {
    path
  };
}

export function readStyleMemoryProfileFromDb(styleProfileId) {
  const row = db.prepare(`
    SELECT style_profile_id, user_id, summary_text, source_turn_count, updated_at
    FROM style_memory_profiles
    WHERE style_profile_id = ?
  `).get(String(styleProfileId || ""));

  if (!row) {
    return null;
  }

  return {
    styleProfileId: row.style_profile_id,
    userId: row.user_id,
    summaryText: row.summary_text || "",
    sourceTurnCount: Number(row.source_turn_count || 0),
    updatedAt: row.updated_at
  };
}

export function writeStyleMemoryProfileToDb(userId, styleProfileId, summaryText, sourceTurnCount, updatedAt = new Date().toISOString()) {
  db.prepare(`
    INSERT INTO style_memory_profiles (
      style_profile_id, user_id, summary_text, source_turn_count, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(style_profile_id) DO UPDATE SET
      summary_text = excluded.summary_text,
      source_turn_count = excluded.source_turn_count,
      updated_at = excluded.updated_at
  `).run(
    String(styleProfileId || ""),
    String(userId || ""),
    String(summaryText || ""),
    Number(sourceTurnCount || 0),
    String(updatedAt)
  );

  return readStyleMemoryProfileFromDb(styleProfileId);
}

export function appendUserMemoryTurnToDb(
  userId,
  styleProfileId,
  userMessage,
  assistantMessage,
  createdAt,
  chatSessionId = "default"
) {
  db.prepare(`
    INSERT INTO user_memory_turns (
      user_id, style_profile_id, chat_session_id, created_at, user_message_json, assistant_message_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(userId || ""),
    String(styleProfileId || defaultStyleProfileId(userId)),
    String(chatSessionId || "default"),
    String(createdAt || new Date().toISOString()),
    JSON.stringify(userMessage || {}),
    JSON.stringify(assistantMessage || {})
  );
}

export function readRecentUserMemoryTurnsFromDb(userId, styleProfileId, limit = 24) {
  if (!Number.isFinite(Number(limit))) {
    return readAllUserMemoryTurnsFromDb(userId, styleProfileId);
  }

  if (!styleProfileId) {
    return db.prepare(`
      SELECT id, user_id, style_profile_id, chat_session_id, created_at, user_message_json, assistant_message_json
      FROM user_memory_turns
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(
      String(userId || ""),
      Math.max(1, Number(limit || 24))
    ).map(mapMemoryTurnRow).reverse();
  }

  return db.prepare(`
    SELECT id, user_id, style_profile_id, chat_session_id, created_at, user_message_json, assistant_message_json
    FROM user_memory_turns
    WHERE user_id = ? AND style_profile_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(
    String(userId || ""),
    String(styleProfileId || defaultStyleProfileId(userId)),
    Math.max(1, Number(limit || 24))
  ).map(mapMemoryTurnRow).reverse();
}

export function readAllUserMemoryTurnsFromDb(userId, styleProfileId) {
  if (!styleProfileId) {
    return db.prepare(`
      SELECT id, user_id, style_profile_id, chat_session_id, created_at, user_message_json, assistant_message_json
      FROM user_memory_turns
      WHERE user_id = ?
      ORDER BY id ASC
    `).all(String(userId || "")).map(mapMemoryTurnRow);
  }

  return db.prepare(`
    SELECT id, user_id, style_profile_id, chat_session_id, created_at, user_message_json, assistant_message_json
    FROM user_memory_turns
    WHERE user_id = ? AND style_profile_id = ?
    ORDER BY id ASC
  `).all(
    String(userId || ""),
    String(styleProfileId || defaultStyleProfileId(userId))
  ).map(mapMemoryTurnRow);
}

export function countUserMemoryTurnsInDb(userId, styleProfileId = null) {
  if (styleProfileId) {
    return Number(
      db.prepare("SELECT COUNT(*) AS count FROM user_memory_turns WHERE user_id = ? AND style_profile_id = ?")
        .get(String(userId || ""), String(styleProfileId || "")).count || 0
    );
  }
  return Number(
    db.prepare("SELECT COUNT(*) AS count FROM user_memory_turns WHERE user_id = ?").get(String(userId || "")).count || 0
  );
}

export function appendUserChatLogToDb(
  userId,
  styleProfileId,
  history,
  reply,
  createdAt,
  chatSessionId = "default"
) {
  db.prepare(`
    INSERT INTO user_chat_logs (
      user_id, style_profile_id, chat_session_id, created_at, history_json, reply_text
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(userId || ""),
    String(styleProfileId || defaultStyleProfileId(userId)),
    String(chatSessionId || "default"),
    String(createdAt || new Date().toISOString()),
    JSON.stringify(Array.isArray(history) ? history : []),
    String(reply || "")
  );
}

export function upsertChatSessionInDb({
  id,
  userId,
  styleProfileId,
  title = "",
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString(),
  messageCount = 0
} = {}) {
  const sessionId = String(id || "").trim();
  if (!sessionId) {
    throw new Error("chat session id is required.");
  }

  db.prepare(`
    INSERT INTO chat_sessions (
      id, user_id, style_profile_id, title, created_at, updated_at, message_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      style_profile_id = excluded.style_profile_id,
      title = CASE
        WHEN chat_sessions.title = '' THEN excluded.title
        ELSE chat_sessions.title
      END,
      updated_at = excluded.updated_at,
      message_count = MAX(chat_sessions.message_count, excluded.message_count)
  `).run(
    sessionId,
    String(userId || ""),
    String(styleProfileId || defaultStyleProfileId(userId)),
    String(title || ""),
    String(createdAt),
    String(updatedAt),
    Math.max(0, Number(messageCount || 0))
  );

  return readChatSessionByIdFromDb(userId, sessionId);
}

export function readChatSessionByIdFromDb(userId, chatSessionId) {
  return mapChatSessionRow(db.prepare(`
    SELECT id, user_id, style_profile_id, title, created_at, updated_at, message_count,
      memory_summary_text, memory_source_message_count, memory_updated_at
    FROM chat_sessions
    WHERE user_id = ? AND id = ?
  `).get(String(userId || ""), String(chatSessionId || "")));
}

export function readLatestChatSessionFromDb(userId, styleProfileId) {
  return mapChatSessionRow(db.prepare(`
    SELECT id, user_id, style_profile_id, title, created_at, updated_at, message_count,
      memory_summary_text, memory_source_message_count, memory_updated_at
    FROM chat_sessions
    WHERE user_id = ? AND style_profile_id = ?
    ORDER BY updated_at DESC, rowid DESC
    LIMIT 1
  `).get(String(userId || ""), String(styleProfileId || defaultStyleProfileId(userId))));
}

export function listChatSessionsFromDb(userId, styleProfileId, limit = 50) {
  return db.prepare(`
    SELECT id, user_id, style_profile_id, title, created_at, updated_at, message_count,
      memory_summary_text, memory_source_message_count, memory_updated_at
    FROM chat_sessions
    WHERE user_id = ? AND style_profile_id = ?
    ORDER BY updated_at DESC, rowid DESC
    LIMIT ?
  `).all(
    String(userId || ""),
    String(styleProfileId || defaultStyleProfileId(userId)),
    Math.max(1, Number(limit || 50))
  ).map(mapChatSessionRow);
}

export function listAllChatSessionsForUserFromDb(userId, limit = 100) {
  return db.prepare(`
    SELECT id, user_id, style_profile_id, title, created_at, updated_at, message_count,
      memory_summary_text, memory_source_message_count, memory_updated_at
    FROM chat_sessions
    WHERE user_id = ?
    ORDER BY updated_at DESC, rowid DESC
    LIMIT ?
  `).all(
    String(userId || ""),
    Math.max(1, Number(limit || 100))
  ).map(mapChatSessionRow);
}

export function insertLocalAgentDeviceToDb({
  id,
  userId,
  name = "",
  tokenHash,
  capabilities = {},
  createdAt = new Date().toISOString()
} = {}) {
  const deviceId = String(id || "").trim();
  const safeUserId = String(userId || "").trim();
  const safeTokenHash = String(tokenHash || "").trim();
  if (!deviceId || !safeUserId || !safeTokenHash) {
    throw new Error("local agent device id, user id, and token hash are required.");
  }

  db.prepare(`
    INSERT INTO local_agent_devices (
      id, user_id, name, token_hash, capabilities_json, created_at, last_seen_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
  `).run(
    deviceId,
    safeUserId,
    String(name || ""),
    safeTokenHash,
    JSON.stringify(capabilities && typeof capabilities === "object" ? capabilities : {}),
    String(createdAt)
  );

  return readLocalAgentDeviceByIdForUserFromDb(safeUserId, deviceId);
}

export function listLocalAgentDevicesByUserIdFromDb(userId) {
  return db.prepare(`
    SELECT id, user_id, name, capabilities_json, created_at, last_seen_at, revoked_at
    FROM local_agent_devices
    WHERE user_id = ? AND revoked_at IS NULL
    ORDER BY COALESCE(last_seen_at, created_at) DESC, created_at DESC
  `).all(String(userId || "")).map(mapLocalAgentDeviceRow);
}

export function readLocalAgentDeviceByIdForUserFromDb(userId, deviceId) {
  return mapLocalAgentDeviceRow(db.prepare(`
    SELECT id, user_id, name, capabilities_json, created_at, last_seen_at, revoked_at
    FROM local_agent_devices
    WHERE user_id = ? AND id = ?
  `).get(String(userId || ""), String(deviceId || "")));
}

export function readLocalAgentDeviceByTokenHashFromDb(tokenHash) {
  return mapLocalAgentDeviceRow(db.prepare(`
    SELECT id, user_id, name, capabilities_json, created_at, last_seen_at, revoked_at
    FROM local_agent_devices
    WHERE token_hash = ?
  `).get(String(tokenHash || "")));
}

export function markLocalAgentDeviceSeenInDb(deviceId, seenAt = new Date().toISOString()) {
  db.prepare(`
    UPDATE local_agent_devices
    SET last_seen_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(String(seenAt), String(deviceId || ""));
}

export function revokeLocalAgentDeviceForUserInDb(
  userId,
  deviceId,
  revokedAt = new Date().toISOString()
) {
  const safeUserId = String(userId || "");
  const safeDeviceId = String(deviceId || "");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE local_agent_devices
      SET revoked_at = ?
      WHERE user_id = ? AND id = ? AND revoked_at IS NULL
    `).run(String(revokedAt), safeUserId, safeDeviceId);

    db.prepare(`
      UPDATE local_agent_tasks
      SET status = 'failed',
        error_text = CASE
          WHEN error_text = '' THEN 'Local Agent device was revoked before this task completed.'
          ELSE error_text
        END,
        finished_at = COALESCE(finished_at, ?)
      WHERE user_id = ?
        AND device_id = ?
        AND status IN ('queued', 'claimed')
    `).run(String(revokedAt), safeUserId, safeDeviceId);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return readLocalAgentDeviceByIdForUserFromDb(safeUserId, safeDeviceId);
}

export function insertLocalAgentTaskToDb({
  id,
  userId,
  deviceId,
  chatSessionId = null,
  styleProfileId,
  taskType = "codex_exec",
  promptText = "",
  command = {},
  createdAt = new Date().toISOString(),
  expiresAt
} = {}) {
  const taskId = String(id || "").trim();
  const safeUserId = String(userId || "").trim();
  const safeDeviceId = String(deviceId || "").trim();
  if (!taskId || !safeUserId || !safeDeviceId) {
    throw new Error("local agent task id, user id, and device id are required.");
  }

  db.prepare(`
    INSERT INTO local_agent_tasks (
      id, user_id, device_id, chat_session_id, style_profile_id, task_type,
      status, prompt_text, command_json, result_text, error_text,
      created_at, claimed_at, finished_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, '', '', ?, NULL, NULL, ?)
  `).run(
    taskId,
    safeUserId,
    safeDeviceId,
    chatSessionId ? String(chatSessionId) : null,
    String(styleProfileId || defaultStyleProfileId(userId)),
    String(taskType || "codex_exec"),
    String(promptText || ""),
    JSON.stringify(command && typeof command === "object" ? command : {}),
    String(createdAt),
    String(expiresAt || new Date(Date.now() + 30 * 60 * 1000).toISOString())
  );

  return readLocalAgentTaskByIdForUserFromDb(safeUserId, taskId);
}

export function readLocalAgentTaskByIdForUserFromDb(userId, taskId) {
  return mapLocalAgentTaskRow(db.prepare(`
    SELECT id, user_id, device_id, chat_session_id, style_profile_id, task_type,
      status, prompt_text, command_json, result_text, error_text,
      created_at, claimed_at, finished_at, expires_at
    FROM local_agent_tasks
    WHERE user_id = ? AND id = ?
  `).get(String(userId || ""), String(taskId || "")));
}

export function listLocalAgentTasksByUserIdFromDb(userId, limit = 25) {
  return db.prepare(`
    SELECT id, user_id, device_id, chat_session_id, style_profile_id, task_type,
      status, prompt_text, command_json, result_text, error_text,
      created_at, claimed_at, finished_at, expires_at
    FROM local_agent_tasks
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(
    String(userId || ""),
    Math.max(1, Number(limit || 25))
  ).map(mapLocalAgentTaskRow);
}

export function claimNextLocalAgentTaskForDeviceInDb(deviceId, claimedAt = new Date().toISOString()) {
  const safeDeviceId = String(deviceId || "");
  db.exec("BEGIN IMMEDIATE");
  try {
    const task = mapLocalAgentTaskRow(db.prepare(`
      SELECT id, user_id, device_id, chat_session_id, style_profile_id, task_type,
        status, prompt_text, command_json, result_text, error_text,
        created_at, claimed_at, finished_at, expires_at
      FROM local_agent_tasks
      WHERE device_id = ?
        AND status = 'queued'
        AND expires_at > ?
      ORDER BY created_at ASC
      LIMIT 1
    `).get(safeDeviceId, String(claimedAt)));

    if (!task) {
      markLocalAgentDeviceSeenInDb(safeDeviceId, claimedAt);
      db.exec("COMMIT");
      return null;
    }

    db.prepare(`
      UPDATE local_agent_tasks
      SET status = 'claimed',
        claimed_at = ?
      WHERE id = ? AND device_id = ? AND status = 'queued'
    `).run(String(claimedAt), task.id, safeDeviceId);
    markLocalAgentDeviceSeenInDb(safeDeviceId, claimedAt);
    db.exec("COMMIT");
    return {
      ...task,
      status: "claimed",
      claimedAt
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function finishLocalAgentTaskForDeviceInDb({
  deviceId,
  taskId,
  status = "completed",
  resultText = "",
  errorText = "",
  finishedAt = new Date().toISOString()
} = {}) {
  const safeStatus = status === "failed" ? "failed" : "completed";
  db.prepare(`
    UPDATE local_agent_tasks
    SET status = ?,
      result_text = ?,
      error_text = ?,
      finished_at = ?
    WHERE id = ?
      AND device_id = ?
      AND status IN ('queued', 'claimed')
  `).run(
    safeStatus,
    String(resultText || ""),
    String(errorText || ""),
    String(finishedAt),
    String(taskId || ""),
    String(deviceId || "")
  );
  markLocalAgentDeviceSeenInDb(deviceId, finishedAt);
  return mapLocalAgentTaskRow(db.prepare(`
    SELECT id, user_id, device_id, chat_session_id, style_profile_id, task_type,
      status, prompt_text, command_json, result_text, error_text,
      created_at, claimed_at, finished_at, expires_at
    FROM local_agent_tasks
    WHERE id = ? AND device_id = ?
  `).get(String(taskId || ""), String(deviceId || "")));
}

export function countChatSessionMessagesInDb(userId, chatSessionId) {
  return Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM user_chat_messages
    WHERE user_id = ? AND chat_session_id = ?
  `).get(String(userId || ""), String(chatSessionId || "")).count || 0);
}

export function readChatSessionMessagesFromDb(userId, chatSessionId) {
  return db.prepare(`
    SELECT id, chat_session_id, user_id, style_profile_id, ordinal, role, content_text, attachments_json, created_at
    FROM user_chat_messages
    WHERE user_id = ? AND chat_session_id = ?
    ORDER BY ordinal ASC
  `).all(String(userId || ""), String(chatSessionId || "")).map(mapChatMessageRow);
}

export function appendChatSessionMessagesToDb(
  userId,
  styleProfileId,
  chatSessionId,
  messages = [],
  createdAt = new Date().toISOString()
) {
  const sessionId = String(chatSessionId || "").trim();
  if (!sessionId || !Array.isArray(messages) || !messages.length) {
    return {
      appended: 0,
      messageCount: countChatSessionMessagesInDb(userId, sessionId)
    };
  }

  const normalizedMessages = messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || ""),
      attachments: Array.isArray(message.attachments) ? message.attachments : []
    }));
  const existingCount = countChatSessionMessagesInDb(userId, sessionId);
  const pendingMessages = normalizedMessages.slice(existingCount);
  if (!pendingMessages.length) {
    upsertChatSessionInDb({
      id: sessionId,
      userId,
      styleProfileId,
      updatedAt: createdAt,
      messageCount: existingCount
    });
    return {
      appended: 0,
      messageCount: existingCount
    };
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO user_chat_messages (
      chat_session_id, user_id, style_profile_id, ordinal, role, content_text, attachments_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const safeUserId = String(userId || "");
  const safeStyleId = String(styleProfileId || defaultStyleProfileId(userId));
  db.exec("BEGIN IMMEDIATE");
  try {
    pendingMessages.forEach((message, index) => {
      insert.run(
        sessionId,
        safeUserId,
        safeStyleId,
        existingCount + index,
        message.role,
        message.content,
        JSON.stringify(message.attachments),
        String(createdAt)
      );
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const messageCount = existingCount + pendingMessages.length;
  const firstUserMessage = normalizedMessages.find((message) => message.role === "user" && message.content);
  upsertChatSessionInDb({
    id: sessionId,
    userId,
    styleProfileId,
    title: firstUserMessage?.content ? firstUserMessage.content.slice(0, 80) : "",
    updatedAt: createdAt,
    messageCount
  });

  return {
    appended: pendingMessages.length,
    messageCount
  };
}

export function writeChatSessionMemoryProfileToDb(
  userId,
  chatSessionId,
  summaryText,
  sourceMessageCount,
  updatedAt = new Date().toISOString()
) {
  db.prepare(`
    UPDATE chat_sessions
    SET memory_summary_text = ?,
      memory_source_message_count = ?,
      memory_updated_at = ?,
      updated_at = MAX(updated_at, ?)
    WHERE user_id = ? AND id = ?
  `).run(
    String(summaryText || ""),
    Math.max(0, Number(sourceMessageCount || 0)),
    String(updatedAt),
    String(updatedAt),
    String(userId || ""),
    String(chatSessionId || "")
  );

  return readChatSessionByIdFromDb(userId, chatSessionId);
}

export function readRecentUserChatLogsFromDb(userId, styleProfileId, limit = 10) {
  if (!Number.isFinite(Number(limit))) {
    return readAllUserChatLogsFromDb(userId, styleProfileId);
  }

  if (!styleProfileId) {
    return db.prepare(`
      SELECT id, user_id, style_profile_id, chat_session_id, created_at, history_json, reply_text
      FROM user_chat_logs
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(
      String(userId || ""),
      Math.max(1, Number(limit || 10))
    ).map(mapChatLogRow).reverse();
  }

  return db.prepare(`
    SELECT id, user_id, style_profile_id, chat_session_id, created_at, history_json, reply_text
    FROM user_chat_logs
    WHERE user_id = ? AND style_profile_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(
    String(userId || ""),
    String(styleProfileId || defaultStyleProfileId(userId)),
    Math.max(1, Number(limit || 10))
  ).map(mapChatLogRow).reverse();
}

export function readAllUserChatLogsFromDb(userId, styleProfileId) {
  if (!styleProfileId) {
    return db.prepare(`
      SELECT id, user_id, style_profile_id, chat_session_id, created_at, history_json, reply_text
      FROM user_chat_logs
      WHERE user_id = ?
      ORDER BY id ASC
    `).all(String(userId || "")).map(mapChatLogRow);
  }

  return db.prepare(`
    SELECT id, user_id, style_profile_id, chat_session_id, created_at, history_json, reply_text
    FROM user_chat_logs
    WHERE user_id = ? AND style_profile_id = ?
    ORDER BY id ASC
  `).all(
    String(userId || ""),
    String(styleProfileId || defaultStyleProfileId(userId))
  ).map(mapChatLogRow);
}

export function countUserChatLogsInDb(userId, styleProfileId = null) {
  if (styleProfileId) {
    return Number(
      db.prepare("SELECT COUNT(*) AS count FROM user_chat_logs WHERE user_id = ? AND style_profile_id = ?")
        .get(String(userId || ""), String(styleProfileId || "")).count || 0
    );
  }
  return Number(
    db.prepare("SELECT COUNT(*) AS count FROM user_chat_logs WHERE user_id = ?").get(String(userId || "")).count || 0
  );
}

export function clearUserBusinessDataInDb(userId, targets = [], styleProfileId = null) {
  const activeTargets = new Set(
    Array.isArray(targets) && targets.length
      ? targets.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : ["chat", "memory", "api_config"]
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    if (activeTargets.has("chat")) {
      if (styleProfileId) {
        db.prepare("DELETE FROM user_chat_logs WHERE user_id = ? AND style_profile_id = ?")
          .run(String(userId || ""), String(styleProfileId || ""));
        db.prepare("DELETE FROM user_chat_messages WHERE user_id = ? AND style_profile_id = ?")
          .run(String(userId || ""), String(styleProfileId || ""));
        db.prepare("DELETE FROM chat_sessions WHERE user_id = ? AND style_profile_id = ?")
          .run(String(userId || ""), String(styleProfileId || ""));
      } else {
        db.prepare("DELETE FROM user_chat_logs WHERE user_id = ?").run(String(userId || ""));
        db.prepare("DELETE FROM user_chat_messages WHERE user_id = ?").run(String(userId || ""));
        db.prepare("DELETE FROM chat_sessions WHERE user_id = ?").run(String(userId || ""));
      }
    }
    if (activeTargets.has("memory")) {
      if (styleProfileId) {
        db.prepare("DELETE FROM user_memory_turns WHERE user_id = ? AND style_profile_id = ?")
          .run(String(userId || ""), String(styleProfileId || ""));
      } else {
        db.prepare("DELETE FROM user_memory_turns WHERE user_id = ?").run(String(userId || ""));
      }
    }
    if (activeTargets.has("api_config")) {
      db.prepare("DELETE FROM user_api_configs WHERE user_id = ?").run(String(userId || ""));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function insertTrainingRunToDb(run = {}) {
  db.prepare(`
    INSERT INTO training_runs (
      id, user_id, style_profile_id, started_at, finished_at, status, pid,
      iterations_target, concurrency, target_score, timeout_ms, progress_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(run.id || ""),
    String(run.userId || ""),
    String(run.styleProfileId || defaultStyleProfileId(run.userId)),
    String(run.startedAt || new Date().toISOString()),
    run.finishedAt || null,
    String(run.status || "running"),
    Number.isFinite(Number(run.pid)) ? Number(run.pid) : null,
    Number(run.iterationsTarget || 0),
    Number(run.concurrency || 1),
    Number(run.targetScore || 0),
    Number(run.timeoutMs || 0),
    run.progress ? JSON.stringify(run.progress) : null
  );
}

export function updateTrainingRunByIdInDb(runId, fields = {}) {
  db.prepare(`
    UPDATE training_runs
    SET finished_at = COALESCE(?, finished_at),
        status = COALESCE(?, status),
        pid = COALESCE(?, pid),
        progress_json = COALESCE(?, progress_json)
    WHERE id = ?
  `).run(
    fields.finishedAt || null,
    fields.status || null,
    Number.isFinite(Number(fields.pid)) ? Number(fields.pid) : null,
    fields.progress ? JSON.stringify(fields.progress) : null,
    String(runId || "")
  );
}

export function updateLatestTrainingRunForUserInDb(userId, fields = {}) {
  const styleProfileId = String(fields.styleProfileId || defaultStyleProfileId(userId));
  const latest = db.prepare(`
    SELECT id
    FROM training_runs
    WHERE user_id = ? AND style_profile_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(String(userId || ""), styleProfileId);

  if (!latest?.id) {
    return null;
  }

  updateTrainingRunByIdInDb(latest.id, fields);
  return latest.id;
}

export function stopOtherRunningTrainingRunsForUserInDb(userId, styleProfileId, keepRunId = null, finishedAt = new Date().toISOString()) {
  const keepId = keepRunId ? String(keepRunId) : null;
  const normalizedStyleId = String(styleProfileId || defaultStyleProfileId(userId));
  if (keepId) {
    db.prepare(`
      UPDATE training_runs
      SET status = 'stopped',
          finished_at = COALESCE(finished_at, ?)
      WHERE user_id = ?
        AND style_profile_id = ?
        AND status = 'running'
        AND id != ?
    `).run(String(finishedAt), String(userId || ""), normalizedStyleId, keepId);
    return;
  }

  db.prepare(`
    UPDATE training_runs
    SET status = 'stopped',
        finished_at = COALESCE(finished_at, ?)
    WHERE user_id = ?
      AND style_profile_id = ?
      AND status = 'running'
  `).run(String(finishedAt), String(userId || ""), normalizedStyleId);
}

export function listTrainingRunsByUserIdFromDb(userId, styleProfileId = null, limit = 20) {
  if (styleProfileId) {
    return db.prepare(`
      SELECT
        id, user_id, style_profile_id, started_at, finished_at, status, pid,
        iterations_target, concurrency, target_score, timeout_ms, progress_json
      FROM training_runs
      WHERE user_id = ? AND style_profile_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(
      String(userId || ""),
      String(styleProfileId || defaultStyleProfileId(userId)),
      Math.max(1, Number(limit || 20))
    ).map(mapTrainingRunRow);
  }
  return db.prepare(`
    SELECT
      id, user_id, style_profile_id, started_at, finished_at, status, pid,
      iterations_target, concurrency, target_score, timeout_ms, progress_json
    FROM training_runs
    WHERE user_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(String(userId || ""), Math.max(1, Number(limit || 20))).map(mapTrainingRunRow);
}

export function listRecentTrainingRunsFromDb(limit = 50) {
  return db.prepare(`
    SELECT
      id, user_id, started_at, finished_at, status, pid,
      iterations_target, concurrency, target_score, timeout_ms, progress_json
    FROM training_runs
    ORDER BY started_at DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit || 50))).map(mapTrainingRunRow);
}

export function countTrainingRunsByUserIdFromDb(userId, styleProfileId = null) {
  if (styleProfileId) {
    return Number(
      db.prepare("SELECT COUNT(*) AS count FROM training_runs WHERE user_id = ? AND style_profile_id = ?")
        .get(String(userId || ""), String(styleProfileId || defaultStyleProfileId(userId))).count || 0
    );
  }
  return Number(
    db.prepare("SELECT COUNT(*) AS count FROM training_runs WHERE user_id = ?").get(String(userId || "")).count || 0
  );
}

export function recordUserUsageDailyToDb(userId, usageKind, startedAt, endedAt) {
  const start = new Date(startedAt || Date.now());
  const end = new Date(endedAt || Date.now());
  const durationMs = Math.max(1, end.getTime() - start.getTime());
  const usageDay = start.toISOString().slice(0, 10);
  const columnMap = {
    chat: "chat_requests",
    training: "training_requests",
    computer: "computer_requests",
    admin: "admin_requests",
    settings: "settings_requests"
  };
  const usageColumn = columnMap[String(usageKind || "").trim().toLowerCase()] || "settings_requests";

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO user_usage_daily (
        user_id, usage_day, total_requests, chat_requests, training_requests,
        computer_requests, admin_requests, settings_requests, total_duration_ms,
        first_seen_at, last_seen_at
      ) VALUES (?, ?, 1, 0, 0, 0, 0, 0, ?, ?, ?)
      ON CONFLICT(user_id, usage_day) DO UPDATE SET
        total_requests = total_requests + 1,
        total_duration_ms = total_duration_ms + excluded.total_duration_ms,
        first_seen_at = CASE
          WHEN first_seen_at IS NULL OR first_seen_at > excluded.first_seen_at THEN excluded.first_seen_at
          ELSE first_seen_at
        END,
        last_seen_at = CASE
          WHEN last_seen_at IS NULL OR last_seen_at < excluded.last_seen_at THEN excluded.last_seen_at
          ELSE last_seen_at
        END
    `).run(String(userId || ""), usageDay, durationMs, start.toISOString(), end.toISOString());

    db.prepare(`UPDATE user_usage_daily SET ${usageColumn} = ${usageColumn} + 1 WHERE user_id = ? AND usage_day = ?`)
      .run(String(userId || ""), usageDay);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readUserUsageSummaryFromDb(userId, limit = 30) {
  return db.prepare(`
    SELECT
      user_id, usage_day, total_requests, chat_requests, training_requests,
      computer_requests, admin_requests, settings_requests, total_duration_ms,
      first_seen_at, last_seen_at
    FROM user_usage_daily
    WHERE user_id = ?
    ORDER BY usage_day DESC
    LIMIT ?
  `).all(String(userId || ""), Math.max(1, Number(limit || 30))).map(mapUsageRow).reverse();
}

export function readGlobalUsageTimelineFromDb(limit = 30) {
  return db.prepare(`
    SELECT
      usage_day,
      SUM(total_requests) AS total_requests,
      SUM(chat_requests) AS chat_requests,
      SUM(training_requests) AS training_requests,
      SUM(computer_requests) AS computer_requests,
      SUM(admin_requests) AS admin_requests,
      SUM(settings_requests) AS settings_requests,
      SUM(total_duration_ms) AS total_duration_ms,
      MIN(first_seen_at) AS first_seen_at,
      MAX(last_seen_at) AS last_seen_at
    FROM user_usage_daily
    GROUP BY usage_day
    ORDER BY usage_day DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit || 30))).map((row) =>
    mapUsageRow({
      user_id: "global",
      ...row
    })
  ).reverse();
}

export function countUsageRowsByUserIdFromDb(userId) {
  return Number(
    db.prepare("SELECT COUNT(*) AS count FROM user_usage_daily WHERE user_id = ?").get(String(userId || "")).count || 0
  );
}
