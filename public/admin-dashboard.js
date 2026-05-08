const authGate = document.getElementById("authGate");
const loginForm = document.getElementById("loginForm");
const loginIdentity = document.getElementById("loginIdentity");
const loginPassword = document.getElementById("loginPassword");
const loginTwoFactorField = document.getElementById("loginTwoFactorField");
const loginTwoFactorCode = document.getElementById("loginTwoFactorCode");
const loginSubmit = document.getElementById("loginSubmit");
const authStatus = document.getElementById("authStatus");
const sessionIdentity = document.getElementById("sessionIdentity");
const refreshAll = document.getElementById("refreshAll");
const logoutButton = document.getElementById("logoutButton");
const adminStatus = document.getElementById("adminStatus");
const summaryCards = document.getElementById("summaryCards");
const usageTimeline = document.getElementById("usageTimeline");
const recentLogins = document.getElementById("recentLogins");
const recentTrainingRuns = document.getElementById("recentTrainingRuns");
const userSearch = document.getElementById("userSearch");
const usersList = document.getElementById("usersList");
const userDetail = document.getElementById("userDetail");
const detailHint = document.getElementById("detailHint");
const refreshDatabase = document.getElementById("refreshDatabase");
const backupDatabase = document.getElementById("backupDatabase");
const databaseStatus = document.getElementById("databaseStatus");
const databaseHealth = document.getElementById("databaseHealth");
const mailMode = document.getElementById("mailMode");
const mailHost = document.getElementById("mailHost");
const mailPort = document.getElementById("mailPort");
const mailSecure = document.getElementById("mailSecure");
const mailUser = document.getElementById("mailUser");
const mailPass = document.getElementById("mailPass");
const mailFrom = document.getElementById("mailFrom");
const mailTestTo = document.getElementById("mailTestTo");
const sendMailTest = document.getElementById("sendMailTest");
const saveMailConfig = document.getElementById("saveMailConfig");
const mailStatus = document.getElementById("mailStatus");

const state = {
  session: null,
  overview: null,
  analytics: null,
  userList: null,
  pendingAdminTwoFactorLogin: null,
  selectedUserId: null
};

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
  return fetch(path, {
    credentials: "include",
    ...options,
    headers
  });
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 1024) return `${Math.max(0, value || 0)} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function setStatus(node, message, kind = "neutral") {
  if (!node) return;
  node.textContent = message;
  node.dataset.kind = kind;
}

function ensureAdminSession() {
  return state.session?.user?.role === "admin";
}

function setAdminTwoFactorMode(enabled, login = "") {
  state.pendingAdminTwoFactorLogin = enabled ? login : null;
  if (loginTwoFactorField) {
    loginTwoFactorField.classList.toggle("hidden", !enabled);
  }
  if (loginSubmit) {
    loginSubmit.textContent = enabled ? "验证 2FA" : "进入后台";
  }
  if (!enabled && loginTwoFactorCode) {
    loginTwoFactorCode.value = "";
  }
}

function createEmptyState(text) {
  const node = document.createElement("div");
  node.className = "detail-empty";
  node.textContent = text;
  return node;
}

function createSummaryCard(label, value, hint) {
  const card = document.createElement("article");
  card.className = "summary-card";

  const labelNode = document.createElement("span");
  labelNode.className = "summary-card-label";
  labelNode.textContent = String(label || "");

  const valueNode = document.createElement("strong");
  valueNode.textContent = String(value ?? "");

  const hintNode = document.createElement("span");
  hintNode.textContent = String(hint || "");

  card.append(labelNode, valueNode, hintNode);
  return card;
}

function createPanelHead(title, meta = "") {
  const head = document.createElement("div");
  head.className = "panel-head";

  const titleNode = document.createElement("h4");
  titleNode.textContent = title;
  head.append(titleNode);

  if (meta) {
    const metaNode = document.createElement("span");
    metaNode.className = "panel-meta";
    metaNode.textContent = meta;
    head.append(metaNode);
  }

  return head;
}

function createTable(container, columns, rows) {
  if (!container) return;
  container.replaceChildren();
  if (!rows.length) {
    container.append(createEmptyState("No data yet."));
    return;
  }

  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = String(column.label || "");
    headRow.append(th);
  });
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const td = document.createElement("td");
      td.textContent = String(column.render(row) ?? "");
      tr.append(td);
    });
    tbody.append(tr);
  });

  table.append(thead, tbody);
  container.append(table);
}

async function loadSession() {
  const response = await apiFetch("/api/auth/session");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load admin session.");

  state.session = data;
  sessionIdentity.textContent = data.user ? `${data.user.account} / ${data.user.email}` : "Not signed in";
  authGate.classList.toggle("hidden", ensureAdminSession());
  return data;
}

async function login(event) {
  event.preventDefault();
  if (state.pendingAdminTwoFactorLogin) {
    await verifyAdminTwoFactor();
    return;
  }

  setStatus(authStatus, "Signing in...");
  try {
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        login: loginIdentity.value || "",
        password: loginPassword.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Admin login failed.");

    if (data.adminTwoFactorRequired) {
      setAdminTwoFactorMode(true, data.login || loginIdentity.value || "");
      if (loginTwoFactorCode) {
        loginTwoFactorCode.value = data.devCode || "";
        loginTwoFactorCode.focus();
      }
      setStatus(
        authStatus,
        data.deliveryMode === "console"
          ? "管理员 2FA 验证码已生成，请输入验证码继续。"
          : "管理员 2FA 验证码已发送到邮箱，请输入验证码继续。",
        "success"
      );
      return;
    }

    await loadSession();
    await loadAll();
    setAdminTwoFactorMode(false);
    setStatus(authStatus, "", "neutral");
  } catch (error) {
    setStatus(authStatus, error instanceof Error ? error.message : "Admin login failed.", "error");
  }
}

async function verifyAdminTwoFactor() {
  setStatus(authStatus, "Verifying 2FA code...");
  try {
    const response = await apiFetch("/api/auth/admin/verify-2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        login: state.pendingAdminTwoFactorLogin || loginIdentity.value || "",
        code: loginTwoFactorCode?.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Admin two-factor verification failed.");
    await loadSession();
    await loadAll();
    setAdminTwoFactorMode(false);
    setStatus(authStatus, "", "neutral");
  } catch (error) {
    setStatus(authStatus, error instanceof Error ? error.message : "Admin two-factor verification failed.", "error");
  }
}

async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
  state.session = null;
  setAdminTwoFactorMode(false);
  authGate.classList.remove("hidden");
  sessionIdentity.textContent = "Not signed in";
}

async function loadUsersList() {
  const response = await apiFetch("/api/admin/users");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load admin users.");
  state.userList = Array.isArray(data.users) ? data.users : [];
}

async function loadOverview() {
  const response = await apiFetch("/api/admin/overview");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load admin overview.");
  state.overview = data;
}

async function loadAnalytics() {
  const response = await apiFetch("/api/admin/analytics");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load admin analytics.");
  state.analytics = data;
}

async function loadMailConfig() {
  const response = await apiFetch("/api/admin/mail-config");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load mail config.");

  mailMode.value = data.config.mode || "console";
  mailHost.value = data.config.host || "";
  mailPort.value = String(data.config.port || 587);
  mailSecure.value = String(Boolean(data.config.secure));
  mailUser.value = data.config.user || "";
  mailPass.value = data.config.pass || "";
  mailFrom.value = data.config.from || "";
  setStatus(mailStatus, data.realMailEnabled ? "SMTP configured." : "Console mail mode active.", data.realMailEnabled ? "success" : "neutral");
}

async function loadDatabaseHealth() {
  const response = await apiFetch("/api/admin/database/health");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load database health.");
  databaseHealth.textContent = JSON.stringify(data, null, 2);
  setStatus(databaseStatus, data.integrity === "ok" ? "Database integrity OK." : `Integrity: ${data.integrity}`, data.integrity === "ok" ? "success" : "error");
}

function collectMailPayload() {
  return {
    mode: mailMode.value,
    host: mailHost.value || "",
    port: Number(mailPort.value || 587),
    secure: mailSecure.value === "true",
    user: mailUser.value || "",
    pass: mailPass.value || "",
    from: mailFrom.value || ""
  };
}

async function saveMail() {
  setStatus(mailStatus, "Saving mail config...");
  const response = await apiFetch("/api/admin/mail-config", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(collectMailPayload())
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to save mail config.");
  await loadMailConfig();
  setStatus(mailStatus, "Mail config saved.", "success");
}

async function testMail() {
  setStatus(mailStatus, "Sending test mail...");
  const response = await apiFetch("/api/admin/mail-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ to: mailTestTo.value || "", config: collectMailPayload() })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to send test mail.");
  setStatus(mailStatus, data.mode === "smtp" ? "Test mail submitted to SMTP." : "Console mode still active.", data.mode === "smtp" ? "success" : "neutral");
}

async function backupDatabaseNow() {
  setStatus(databaseStatus, "Creating database backup...");
  const response = await apiFetch("/api/admin/database/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: "{}"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to create database backup.");
  await loadDatabaseHealth();
  setStatus(databaseStatus, `Backup created: ${data.backup.path}`, "success");
}

function renderSummary() {
  const overview = state.overview;
  if (!overview) return;
  const counts = overview.database?.health?.counts || {};
  const items = [
    ["Users", overview.summary?.totalUsers || 0, "registered"],
    ["Admins", overview.summary?.adminUsers || 0, "administrator accounts"],
    ["Sessions", overview.summary?.activeSessions || 0, "active sessions"],
    ["Storage", formatBytes(overview.summary?.totalBytes || 0), "runtime files"],
    ["Chats", counts.chatLogs || 0, "chat rows"],
    ["Memory", counts.memoryTurns || 0, "memory rows"],
    ["Training", counts.trainingRuns || 0, "training rows"],
    ["Logins", counts.loginEvents || 0, "audit rows"]
  ];
  summaryCards.replaceChildren(...items.map(([label, value, hint]) => createSummaryCard(label, value, hint)));
}

function renderUsageTimeline() {
  const items = Array.isArray(state.analytics?.usageTimeline) ? state.analytics.usageTimeline : [];
  usageTimeline.replaceChildren();
  if (!items.length) {
    usageTimeline.append(createEmptyState("No usage timeline yet."));
    return;
  }
  const max = Math.max(...items.map((item) => Number(item.totalRequests || 0)), 1);
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "timeline-row";

    const dayNode = document.createElement("div");
    dayNode.className = "timeline-day";
    dayNode.textContent = String(item.usageDay || "");

    const barShell = document.createElement("div");
    barShell.className = "timeline-bar";
    const barFill = document.createElement("div");
    barFill.className = "timeline-bar-fill";
    barFill.style.width = `${(Number(item.totalRequests || 0) / max) * 100}%`;
    barShell.append(barFill);

    const valueNode = document.createElement("div");
    valueNode.className = "timeline-value";
    valueNode.textContent = `${item.totalRequests} req`;

    row.append(dayNode, barShell, valueNode);
    usageTimeline.append(row);
  });
}

function renderAnalyticsTables() {
  createTable(
    recentLogins,
    [
      { label: "Time", render: (row) => formatDateTime(row.createdAt) },
      { label: "Identifier", render: (row) => row.loginIdentifier || "-" },
      { label: "Status", render: (row) => row.status || "-" },
      { label: "IP", render: (row) => row.ipAddress || "-" }
    ],
    Array.isArray(state.analytics?.recentLoginEvents) ? state.analytics.recentLoginEvents : []
  );

  createTable(
    recentTrainingRuns,
    [
      { label: "Time", render: (row) => formatDateTime(row.startedAt) },
      { label: "User", render: (row) => row.userId || "-" },
      { label: "Status", render: (row) => row.status || "-" },
      { label: "Target", render: (row) => row.targetScore ?? "-" }
    ],
    Array.isArray(state.analytics?.recentTrainingRuns) ? state.analytics.recentTrainingRuns : []
  );
}

async function loadUserDetail(userId) {
  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/data`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load user detail.");
  return data;
}

async function runUserAction(userId, action, body) {
  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body || {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Admin action failed.");
  await loadAll();
}

async function loadAll() {
  setStatus(adminStatus, "Loading admin dashboard...");
  showUsersLoading();

  await loadUsersList();
  renderUsers();

  await loadAnalytics();
  renderUsageTimeline();
  renderAnalyticsTables();

  setStatus(adminStatus, "Users and analytics loaded. Refreshing overview, database, and mail...");

  await loadOverview();
  renderSummary();

  const backgroundLoads = await Promise.allSettled([loadMailConfig(), loadDatabaseHealth()]);
  const rejected = backgroundLoads.filter((item) => item.status === "rejected");
  if (rejected.length) {
    const reason = rejected[0]?.reason;
    setStatus(
      adminStatus,
      reason instanceof Error ? reason.message : "Part of the admin dashboard failed to refresh.",
      "error"
    );
    return;
  }

  setStatus(
    adminStatus,
    state.overview?.cached ? "Admin dashboard refreshed (cached overview)." : "Admin dashboard refreshed.",
    "success"
  );
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderUsers() {
  const users = Array.isArray(state.userList)
    ? state.userList
    : Array.isArray(state.overview?.users)
      ? state.overview.users
      : [];
  const keyword = String(userSearch?.value || "").trim().toLowerCase();
  const filtered = users.filter((user) =>
    !keyword ||
    String(user.account || "").toLowerCase().includes(keyword) ||
    String(user.email || "").toLowerCase().includes(keyword)
  );

  usersList.replaceChildren();
  if (!filtered.length) {
    usersList.append(createEmptyState("No matching users."));
    return;
  }

  filtered.forEach((user) => {
    const tile = document.createElement("article");
    tile.className = "user-tile";

    const title = document.createElement("h5");
    title.textContent = String(user.account || "");
    const email = document.createElement("p");
    email.textContent = String(user.email || "");
    const metrics = document.createElement("div");
    metrics.className = "user-metrics";
    [
      String(user.role || ""),
      `session ${user.sessionCount || 0}`,
      `chat ${user.databaseData?.chatLogs || 0}`,
      `memory ${user.databaseData?.memoryTurns || 0}`,
      `train ${user.databaseData?.trainingRuns || 0}`
    ].forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "metric-chip";
      chip.textContent = value;
      metrics.append(chip);
    });

    tile.append(title, email, metrics);
    tile.addEventListener("click", async () => {
      state.selectedUserId = user.id;
      detailHint.textContent = `${user.account} / ${user.email}`;
      userDetail.replaceChildren(createEmptyState("Loading user detail..."));
      try {
        const data = await loadUserDetail(user.id);
        renderUserDetail(user, data);
      } catch (error) {
        userDetail.replaceChildren(createEmptyState(error instanceof Error ? error.message : "Failed to load user detail."));
      }
    });
    usersList.append(tile);
  });
}

function showUsersLoading() {
  if (!usersList) return;
  usersList.replaceChildren(createEmptyState("Loading users..."));
}

function renderUserDetail(user, data) {
  const wrapper = document.createElement("div");
  wrapper.className = "user-detail";

  const summary = document.createElement("section");
  summary.className = "detail-card";
  const detailGrid = document.createElement("div");
  detailGrid.className = "detail-grid";
  detailGrid.append(
    createSummaryCard("Role", user.role, user.disabledAt ? "disabled" : "active"),
    createSummaryCard("Last login", formatDateTime(user.lastLoginAt), "user"),
    createSummaryCard("Last seen", formatDateTime(user.lastSeenAt), "session")
  );
  summary.append(detailGrid);

  const actions = document.createElement("div");
  actions.className = "detail-actions";
  [
    ["Export JSON", "ghost-button", () => downloadJson(`${user.account}-data.json`, data)],
    ["Revoke Sessions", "ghost-button", async () => runUserAction(user.id, "revoke-sessions", {})],
    [user.disabledAt ? "Enable User" : "Disable User", "ghost-button", async () => runUserAction(user.id, "set-disabled", { disabled: !Boolean(user.disabledAt) })],
    ["Clear Data", "send-button", async () => runUserAction(user.id, "clear-data", {})]
  ].forEach(([label, className, handler]) => {
    const button = document.createElement("button");
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    actions.append(button);
  });
  summary.append(actions);
  wrapper.append(summary);

  [
    ["API Config", data.apiConfig || { configured: false }],
    ["Styles", data.styles || []],
    ["Style Buckets", data.styleBuckets || []],
    ["Recent Sessions", data.recentSessions || []],
    ["Recent Login Events", data.recentLoginEvents || []],
    ["Recent Training Runs", data.recentTrainingRuns || []],
    ["Usage Summary", data.usageSummary || []]
  ].forEach(([title, payload]) => {
    const block = document.createElement("section");
    block.className = "detail-card";
    block.append(createPanelHead(title));
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(payload, null, 2);
    block.append(pre);
    wrapper.append(block);
  });

  userDetail.replaceChildren(wrapper);
}

if (loginForm) {
  loginForm.addEventListener("submit", login);
}

if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}

if (refreshAll) {
  refreshAll.addEventListener("click", async () => {
    try {
      await loadAll();
    } catch (error) {
      setStatus(adminStatus, error instanceof Error ? error.message : "Failed to refresh admin.", "error");
    }
  });
}

if (userSearch) {
  userSearch.addEventListener("input", renderUsers);
}

if (refreshDatabase) {
  refreshDatabase.addEventListener("click", async () => {
    try {
      await loadDatabaseHealth();
    } catch (error) {
      setStatus(databaseStatus, error instanceof Error ? error.message : "Failed to load database health.", "error");
    }
  });
}

if (backupDatabase) {
  backupDatabase.addEventListener("click", async () => {
    try {
      await backupDatabaseNow();
    } catch (error) {
      setStatus(databaseStatus, error instanceof Error ? error.message : "Failed to back up database.", "error");
    }
  });
}

if (saveMailConfig) {
  saveMailConfig.addEventListener("click", async () => {
    try {
      await saveMail();
    } catch (error) {
      setStatus(mailStatus, error instanceof Error ? error.message : "Failed to save mail config.", "error");
    }
  });
}

if (sendMailTest) {
  sendMailTest.addEventListener("click", async () => {
    try {
      await testMail();
    } catch (error) {
      setStatus(mailStatus, error instanceof Error ? error.message : "Failed to send test mail.", "error");
    }
  });
}

(async () => {
  try {
    await loadSession();
    if (ensureAdminSession()) {
      await loadAll();
    }
  } catch (error) {
    setStatus(authStatus, error instanceof Error ? error.message : "Failed to load admin session.", "error");
    authGate.classList.remove("hidden");
  }
})();
