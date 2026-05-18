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
const localAgentDevice = document.getElementById("localAgentDevice");
const localAgentName = document.getElementById("localAgentName");
const localAgentStatus = document.getElementById("localAgentStatus");
const refreshLocalAgents = document.getElementById("refreshLocalAgents");
const registerLocalAgent = document.getElementById("registerLocalAgent");
const revokeLocalAgent = document.getElementById("revokeLocalAgent");
const copyLocalAgentCommand = document.getElementById("copyLocalAgentCommand");
const runLocalAgentTask = document.getElementById("runLocalAgentTask");
const localAgentCommand = document.getElementById("localAgentCommand");
const localAgentResult = document.getElementById("localAgentResult");

let pollTimer = null;
let localAgentPollTimer = null;
let localAgentDevices = [];

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

function stopLocalAgentPolling() {
  if (localAgentPollTimer !== null) {
    clearTimeout(localAgentPollTimer);
    localAgentPollTimer = null;
  }
}

function setLocalAgentResult(text, show = true) {
  if (!localAgentResult) return;
  localAgentResult.textContent = text;
  localAgentResult.classList.toggle("hidden", !show);
}

function setLocalAgentStatus(text, kind = "neutral") {
  if (!localAgentStatus) return;
  localAgentStatus.textContent = text;
  localAgentStatus.dataset.kind = kind;
}

function selectedLocalAgentDevice() {
  const selectedId = String(localAgentDevice?.value || "").trim();
  return localAgentDevices.find((device) => device.id === selectedId) || null;
}

function updateLocalAgentGuideStatus() {
  if (!localAgentDevices.length) {
    setLocalAgentStatus("Step 1: register a Local Agent for this computer.");
    return;
  }

  const device = selectedLocalAgentDevice() || localAgentDevices[0];
  if (device?.online) {
    setLocalAgentStatus("Step 4: Local Agent is online. Enter a task and run it safely.", "success");
    return;
  }

  setLocalAgentStatus("Step 2/3: run the command on your machine, then click Refresh until this device is online.");
}

function renderLocalAgentDevices() {
  if (!localAgentDevice) {
    return;
  }

  const selected = localAgentDevice.value;
  localAgentDevice.innerHTML = "";
  if (!localAgentDevices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No Local Agent registered";
    localAgentDevice.append(option);
    if (runLocalAgentTask) {
      runLocalAgentTask.disabled = true;
    }
    if (revokeLocalAgent) {
      revokeLocalAgent.disabled = true;
    }
    updateLocalAgentGuideStatus();
    return;
  }

  localAgentDevices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = `${device.name || "Local Agent"} (${device.online ? "online" : "offline"})`;
    localAgentDevice.append(option);
  });

  if (selected && localAgentDevices.some((device) => device.id === selected)) {
    localAgentDevice.value = selected;
  }

  if (runLocalAgentTask) {
    runLocalAgentTask.disabled = false;
  }
  if (revokeLocalAgent) {
    revokeLocalAgent.disabled = false;
  }
  updateLocalAgentGuideStatus();
}

async function loadLocalAgents() {
  const response = await apiFetch("/api/local-agent/devices");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load Local Agent devices.");
  }

  localAgentDevices = Array.isArray(data.devices) ? data.devices : [];
  renderLocalAgentDevices();
  return localAgentDevices;
}

async function registerLocalAgentDevice() {
  if (promptForAuth("Please sign in before registering a Local Agent.")) {
    return;
  }

  const defaultName = `${navigator.platform || "Local"} Codex Agent`;
  const name = String(localAgentName?.value || "").trim() || defaultName;
  setLocalAgentStatus("Registering Local Agent and creating a private token...");
  const response = await apiFetch("/api/local-agent/devices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      name,
      capabilities: {
        codexExec: true,
        platform: navigator.platform || ""
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to register Local Agent.");
  }

  if (localAgentCommand) {
    const downloadCommand = data.downloadCommand || `curl -fsSL "${data.runnerUrl || `${getApiBase() || window.location.origin}/local-agent-runner.mjs`}" -o local-agent-runner.mjs`;
    const runCommand = data.runCommand || `node local-agent-runner.mjs --server "${getApiBase() || window.location.origin}" --token "${data.token || ""}"`;
    const powershellDownloadCommand = data.powershellDownloadCommand ||
      `Invoke-WebRequest -Uri "${data.runnerUrl || `${getApiBase() || window.location.origin}/local-agent-runner.mjs`}" -OutFile "local-agent-runner.mjs"`;
    const powershellRunCommand = data.powershellRunCommand ||
      `node .\\local-agent-runner.mjs --server "${getApiBase() || window.location.origin}" --token "${data.token || ""}"`;
    const posixCommands = `${downloadCommand}\n${runCommand}`;
    const powershellCommands = `${powershellDownloadCommand}\n${powershellRunCommand}`;
    localAgentCommand.dataset.commandText = /win/i.test(navigator.platform || "")
      ? powershellCommands
      : posixCommands;
    localAgentCommand.dataset.commandTextPosix = posixCommands;
    localAgentCommand.dataset.commandTextPowershell = powershellCommands;
    localAgentCommand.textContent = [
      "Windows PowerShell:",
      "",
      powershellDownloadCommand,
      powershellRunCommand,
      "",
      "macOS / Linux:",
      "",
      downloadCommand,
      runCommand,
      "",
      "If you already have the project repo, you can also run scripts/local_agent.mjs directly.",
      "Keep this token private. The public server stores only its hash."
    ].join("\n");
    localAgentCommand.classList.remove("hidden");
  }
  if (copyLocalAgentCommand) {
    copyLocalAgentCommand.classList.remove("hidden");
  }
  setLocalAgentStatus("Step 2: copy the command and run it on your own machine.");
  await loadLocalAgents();
  if (data.device?.id && localAgentDevice) {
    localAgentDevice.value = data.device.id;
  }
  updateLocalAgentGuideStatus();
}

async function copyLocalAgentRunnerCommand() {
  const commandText = String(localAgentCommand?.dataset?.commandText || "").trim();
  if (!commandText) {
    setLocalAgentStatus("Register a Local Agent first, then copy the command.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(commandText);
    setLocalAgentStatus("Commands copied. Run them in a terminal on your own machine, then click Refresh.", "success");
  } catch {
    if (localAgentCommand) {
      localAgentCommand.focus?.();
    }
    setLocalAgentStatus("Copy failed. Select the command text manually and run it locally.", "error");
  }
}

async function revokeSelectedLocalAgentDevice() {
  const device = selectedLocalAgentDevice();
  if (!device?.id) {
    setLocalAgentStatus("Select a Local Agent device to revoke.", "error");
    return;
  }

  const confirmed = window.confirm(
    `Revoke "${device.name || "Local Agent"}"? This immediately invalidates its token and fails queued tasks.`
  );
  if (!confirmed) {
    return;
  }

  const response = await apiFetch(`/api/local-agent/devices/${encodeURIComponent(device.id)}/revoke`, {
    method: "POST"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to revoke Local Agent.");
  }

  if (localAgentCommand) {
    localAgentCommand.textContent = "";
    localAgentCommand.classList.add("hidden");
    delete localAgentCommand.dataset.commandText;
    delete localAgentCommand.dataset.commandTextPosix;
    delete localAgentCommand.dataset.commandTextPowershell;
  }
  if (copyLocalAgentCommand) {
    copyLocalAgentCommand.classList.add("hidden");
  }
  setLocalAgentStatus("Local Agent revoked. Register a new one if you need local execution.", "success");
  await loadLocalAgents();
}

function formatLocalAgentTaskResult(task = {}) {
  const output = String(task.resultText || "").trim();
  const error = String(task.errorText || "").trim();
  if (task.status === "completed") {
    return output || "Local Agent completed without stdout.";
  }
  if (task.status === "failed") {
    return [error || "Local Agent task failed.", output].filter(Boolean).join("\n\n");
  }
  return `Task ${task.status || "queued"}; waiting for your Local Agent to claim it.`;
}

async function pollLocalAgentTask(taskId) {
  stopLocalAgentPolling();
  localAgentPollTimer = window.setTimeout(async () => {
    try {
      const response = await apiFetch(`/api/local-agent/tasks/${encodeURIComponent(taskId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to poll Local Agent task.");
      }

      const task = data.task || {};
      setLocalAgentResult(formatLocalAgentTaskResult(task));
      if (task.status === "queued" || task.status === "claimed") {
        setLocalAgentStatus(
          task.status === "claimed"
            ? "Local Agent claimed the task and is running codex exec..."
            : "Task is queued. Keep the Local Agent command running on your machine."
        );
        await pollLocalAgentTask(taskId);
        return;
      }

      stopLocalAgentPolling();
      if (task.status === "completed") {
        setLocalAgentStatus("Local Agent finished successfully.", "success");
        window.__hegelSalonApp?.appendTechnicalResult?.(formatLocalAgentTaskResult(task));
        window.__hegelSalonApp?.refreshChatSessions?.();
      } else if (task.status === "failed") {
        setLocalAgentStatus("Local Agent reported a failure. Check the result box below.", "error");
      }
    } catch (error) {
      setLocalAgentResult(error instanceof Error ? error.message : "Local Agent polling failed.");
      stopLocalAgentPolling();
    }
  }, 1400);
}

async function queueLocalAgentTask() {
  if (promptForAuth("Please sign in before using Local Agent execution.")) {
    return;
  }

  const task = String(computerTask?.value || "").trim();
  const startUrl = String(computerStartUrl?.value || "").trim();
  const deviceId = String(localAgentDevice?.value || "").trim();
  if (!deviceId) {
    setLocalAgentResult("Register and start a Local Agent first.");
    setLocalAgentStatus("Step 1: register a Local Agent before sending tasks.", "error");
    return;
  }
  if (!task) {
    setLocalAgentResult("Enter a task before queuing Local Agent execution.");
    setLocalAgentStatus("Step 4: enter a task, then run it with Local Agent.", "error");
    return;
  }

  const context = window.__hegelSalonApp?.getCurrentChatContext?.() || {};
  const device = selectedLocalAgentDevice();
  if (device && !device.online) {
    setLocalAgentStatus("The task can be queued, but this device is offline. Start the local command to claim it.");
  } else {
    setLocalAgentStatus("Queueing task for the online Local Agent...");
  }
  runLocalAgentTask.disabled = true;
  setLocalAgentResult("Queued for your Local Agent. Keep the local runner open.");
  try {
    const response = await apiFetch("/api/local-agent/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        deviceId,
        taskType: "codex_exec",
        prompt: task,
        startUrl,
        styleProfileId: context.styleProfileId || "",
        chatSessionId: context.chatSessionId || ""
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Failed to queue Local Agent task.");
    }
    if (!data.task?.id) {
      throw new Error("Local Agent task id was not returned.");
    }
    await pollLocalAgentTask(data.task.id);
  } catch (error) {
    setLocalAgentResult(error instanceof Error ? error.message : "Local Agent task failed.");
  } finally {
    runLocalAgentTask.disabled = false;
  }
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
      await loadLocalAgents().catch((error) => {
        setLocalAgentResult(error instanceof Error ? error.message : "Failed to load Local Agent devices.");
      });
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
    stopLocalAgentPolling();
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

if (refreshLocalAgents) {
  refreshLocalAgents.addEventListener("click", async () => {
    try {
      await loadLocalAgents();
      setLocalAgentResult("Local Agent list refreshed.", true);
    } catch (error) {
      setLocalAgentResult(error instanceof Error ? error.message : "Failed to refresh Local Agents.");
      setLocalAgentStatus("Could not refresh Local Agents. Check your login and network.", "error");
    }
  });
}

if (registerLocalAgent) {
  registerLocalAgent.addEventListener("click", async () => {
    registerLocalAgent.disabled = true;
    try {
      await registerLocalAgentDevice();
    } catch (error) {
      setLocalAgentResult(error instanceof Error ? error.message : "Failed to register Local Agent.");
    } finally {
      registerLocalAgent.disabled = false;
    }
  });
}

if (revokeLocalAgent) {
  revokeLocalAgent.addEventListener("click", async () => {
    revokeLocalAgent.disabled = true;
    try {
      await revokeSelectedLocalAgentDevice();
    } catch (error) {
      setLocalAgentResult(error instanceof Error ? error.message : "Failed to revoke Local Agent.");
      setLocalAgentStatus("Could not revoke Local Agent. Check your login and network.", "error");
    } finally {
      revokeLocalAgent.disabled = false;
    }
  });
}

if (runLocalAgentTask) {
  runLocalAgentTask.addEventListener("click", queueLocalAgentTask);
}

if (copyLocalAgentCommand) {
  copyLocalAgentCommand.addEventListener("click", copyLocalAgentRunnerCommand);
}

if (localAgentDevice) {
  localAgentDevice.addEventListener("change", updateLocalAgentGuideStatus);
}
