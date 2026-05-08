const openComputer = document.getElementById("openComputer");
const closeComputer = document.getElementById("closeComputer");
const computerPanel = document.getElementById("computerPanel");
const computerStartUrl = document.getElementById("computerStartUrl");
const computerTask = document.getElementById("computerTask");
const runComputerTask = document.getElementById("runComputerTask");
const resetComputerTask = document.getElementById("resetComputerTask");
const computerStatus = document.getElementById("computerStatus");
const computerScreenshot = document.getElementById("computerScreenshot");
const computerPlaceholder = document.getElementById("computerPlaceholder");
const computerCurrentUrl = document.getElementById("computerCurrentUrl");
const computerCurrentTitle = document.getElementById("computerCurrentTitle");
const computerTranscript = document.getElementById("computerTranscript");

let pollTimer = null;

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

  const stored = localStorage.getItem("hegel-salon-api-base");
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

function promptForAuth(message = "请先登录。") {
  if (window.__hegelSalonApp?.authRequired?.()) {
    window.__hegelSalonApp.openAuthGate?.();
    setComputerStatus(message, "error");
    return true;
  }

  return false;
}

function stopPolling() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function setComputerStatus(text, kind = "neutral") {
  if (!computerStatus) return;
  computerStatus.textContent = text;
  computerStatus.dataset.kind = kind;
}

function renderComputerState(state = {}) {
  const screenshot = state.screenshot || "";

  if (computerCurrentUrl) {
    computerCurrentUrl.textContent = `URL: ${state.currentUrl || "-"}`;
  }

  if (computerCurrentTitle) {
    computerCurrentTitle.textContent = `Title: ${state.title || "-"}`;
  }

  if (computerTranscript) {
    const transcript = Array.isArray(state.transcript) && state.transcript.length
      ? state.transcript.join("\n")
      : "暂无操作记录。";
    computerTranscript.textContent = transcript;
  }

  if (computerScreenshot && computerPlaceholder) {
    if (screenshot) {
      computerScreenshot.src = screenshot;
      computerScreenshot.classList.remove("hidden");
      computerPlaceholder.classList.add("hidden");
    } else {
      computerScreenshot.removeAttribute("src");
      computerScreenshot.classList.add("hidden");
      computerPlaceholder.classList.remove("hidden");
    }
  }

  if (state.status === "completed") {
    setComputerStatus(state.finalText || "浏览器任务已完成。", "success");
    stopPolling();
    return;
  }

  if (state.status === "needs_review") {
    setComputerStatus(
      "模型触发了安全审查，请先查看执行记录。",
      "error"
    );
    stopPolling();
    return;
  }

  if (state.status === "running") {
    setComputerStatus("Computer Use 正在运行…", "neutral");
    return;
  }

  if (state.status === "stopped") {
    setComputerStatus(
      state.finalText || "Computer Use 已停止，可能达到步数上限。",
      "neutral"
    );
    stopPolling();
    return;
  }

  if (state.status === "failed") {
    setComputerStatus("Computer Use 失败，请查看执行记录。", "error");
    stopPolling();
    return;
  }

  stopPolling();
  setComputerStatus("浏览器代理当前空闲。", "neutral");
}

async function loadComputerState() {
  const response = await apiFetch("/api/computer/state");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "加载 Computer Use 状态失败。");
  }

  renderComputerState(data);
  return data;
}

function schedulePoll() {
  stopPolling();
  pollTimer = window.setTimeout(async () => {
    try {
      const state = await loadComputerState();
      if (state.status === "running") {
        schedulePoll();
      }
    } catch (error) {
      setComputerStatus(
        error instanceof Error ? error.message : "刷新浏览器状态失败。",
        "error"
      );
      stopPolling();
    }
  }, 1200);
}

async function resetComputer() {
  setComputerStatus("正在重置浏览器…", "neutral");
  const response = await apiFetch("/api/computer/reset", { method: "POST" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "重置浏览器失败。");
  }
  renderComputerState(data.state || {});
}

async function runTask() {
  if (promptForAuth("请先登录后再使用 Computer Use。")) {
    return;
  }

  const task = String(computerTask?.value || "").trim();
  const startUrl = String(computerStartUrl?.value || "").trim();

  if (!task) {
    setComputerStatus("请先输入浏览器任务。", "error");
    return;
  }

  runComputerTask.disabled = true;
  resetComputerTask.disabled = true;
  setComputerStatus("Computer Use 正在运行…", "neutral");

  try {
    const response = await apiFetch("/api/computer/task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({ task, startUrl })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Computer Use 失败。");
    }

    renderComputerState(data.state || {});
    if ((data.state || {}).status === "running") {
      schedulePoll();
    }
  } catch (error) {
    setComputerStatus(
      error instanceof Error ? error.message : "Computer Use 失败。",
      "error"
    );
  } finally {
    runComputerTask.disabled = false;
    resetComputerTask.disabled = false;
  }
}

if (openComputer && computerPanel) {
  openComputer.addEventListener("click", async () => {
    if (promptForAuth("请先登录后再使用 Computer Use。")) {
      return;
    }

    computerPanel.classList.remove("hidden");
    try {
      const state = await loadComputerState();
      if (state.status === "running") {
        schedulePoll();
      }
    } catch (error) {
      setComputerStatus(
        error instanceof Error ? error.message : "加载浏览器状态失败。",
        "error"
      );
    }
  });
}

if (closeComputer && computerPanel) {
  closeComputer.addEventListener("click", () => {
    computerPanel.classList.add("hidden");
    stopPolling();
  });
}

if (runComputerTask) {
  runComputerTask.addEventListener("click", runTask);
}

if (resetComputerTask) {
  resetComputerTask.addEventListener("click", async () => {
    runComputerTask.disabled = true;
    resetComputerTask.disabled = true;
    try {
      await resetComputer();
    } catch (error) {
      setComputerStatus(
        error instanceof Error ? error.message : "重置浏览器失败。",
        "error"
      );
    } finally {
      runComputerTask.disabled = false;
      resetComputerTask.disabled = false;
    }
  });
}
