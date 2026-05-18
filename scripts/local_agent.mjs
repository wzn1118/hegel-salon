#!/usr/bin/env node
import { spawn } from "node:child_process";
import { hostname, platform } from "node:os";
import { resolve } from "node:path";

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function trimOutput(value, maxLength = 120000) {
  const raw = String(value || "");
  return raw.length > maxLength ? raw.slice(raw.length - maxLength) : raw;
}

function isLoopbackHostname(value = "") {
  const hostname = String(value || "").toLowerCase();
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost");
}

function normalizeServerUrl(rawServer = "") {
  const normalized = String(rawServer || "").trim().replace(/\/+$/, "");
  let url = null;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("The --server value must be a valid URL.");
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHostname(url.hostname))) {
    throw new Error("Local Agent only accepts HTTPS servers, except localhost development URLs.");
  }

  return url.toString().replace(/\/+$/, "");
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${server}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: process.env,
      shell: process.platform === "win32",
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, options.timeoutMs || 20 * 60 * 1000);

    child.stdout?.on("data", (chunk) => {
      stdout = trimOutput(stdout + chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk) => {
      stderr = trimOutput(stderr + chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolveRun({
        ok: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolveRun({
        ok: code === 0,
        stdout,
        stderr,
        code
      });
    });
  });
}

async function executeTask(task) {
  if (!task || task.taskType !== "codex_exec") {
    return {
      ok: false,
      output: "",
      error: `Unsupported local task type: ${task?.taskType || "unknown"}`
    };
  }

  const cwd = allowRemoteCwd && task.command?.cwd ? resolve(String(task.command.cwd)) : defaultCwd;
  const prompt = String(task.promptText || "").trim();
  if (!prompt) {
    return {
      ok: false,
      output: "",
      error: "Task prompt is empty."
    };
  }

  const args = ["exec", "--skip-git-repo-check", prompt];
  const result = await runProcess(codexCommand, args, {
    cwd,
    timeoutMs
  });
  return {
    ok: result.ok,
    output: trimOutput(result.stdout || ""),
    error: trimOutput(result.stderr || "")
  };
}

async function postResult(task, result) {
  await requestJson(`/api/local-agent/tasks/${encodeURIComponent(task.id)}/result`, {
    method: "POST",
    body: JSON.stringify({
      status: result.ok ? "completed" : "failed",
      resultText: result.output || "",
      errorText: result.error || ""
    })
  });
}

let server = "";
try {
  server = normalizeServerUrl(readArg("server"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const token = readArg("token");
const codexCommand = readArg("codex", "codex");
const defaultCwd = resolve(readArg("cwd", process.cwd()));
const allowRemoteCwd = process.argv.includes("--allow-remote-cwd");
const intervalMs = Math.max(1000, Number(readArg("interval-ms", "2500")) || 2500);
const timeoutMs = Math.max(30000, Number(readArg("timeout-ms", `${20 * 60 * 1000}`)) || 20 * 60 * 1000);

if (!server || !/^hsloc_[A-Za-z0-9_-]{32,}$/.test(token)) {
  console.error("Usage: node local-agent-runner.mjs --server https://example.com --token hsloc_...");
  process.exit(1);
}

console.log(`Local Codex Agent online from ${hostname()} (${platform()})`);
console.log(`Polling ${server}; executing tasks in ${defaultCwd}`);
if (!allowRemoteCwd) {
  console.log("Remote cwd is disabled; all tasks run in the startup directory. Use --allow-remote-cwd only if you understand the risk.");
}

for (;;) {
  try {
    const { task } = await requestJson("/api/local-agent/tasks/next");
    if (!task) {
      await sleep(intervalMs);
      continue;
    }

    console.log(`Claimed ${task.id} (${task.taskType})`);
    const result = await executeTask(task);
    await postResult(task, result);
    console.log(`Finished ${task.id}: ${result.ok ? "completed" : "failed"}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    await sleep(intervalMs);
  }
}
