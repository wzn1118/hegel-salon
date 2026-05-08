import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { dataDir, researchDir } from "./projectPaths.mjs";

export const sharedLogsDir = join(dataDir, "logs");
export const sharedUploadsDir = join(dataDir, "uploads");
export const authDir = join(dataDir, "auth");
export const usersDir = join(dataDir, "users");

function sanitizeSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildRuntimeScope(userId = null, styleProfileId = null) {
  const safeUserId = sanitizeSegment(userId);
  const safeStyleId = sanitizeSegment(styleProfileId);

  if (!safeUserId) {
    return {
      userId: null,
      styleProfileId: null,
      userRoot: dataDir,
      styleRoot: null,
      configDir: join(dataDir, "config"),
      logsDir: sharedLogsDir,
      uploadsDir: sharedUploadsDir,
      computerDir: dataDir,
      computerStatePath: join(dataDir, "computer-use-state.json"),
      computerWorkerPidPath: join(dataDir, "computer-use-worker.pid"),
      optimizerProgressPath: join(sharedLogsDir, "optimizer-progress.json"),
      optimizerMemoryPath: join(sharedLogsDir, "optimizer-memory.jsonl"),
      optimizerPlaybookPath: join(sharedLogsDir, "optimizer-playbook.json"),
      optimizerJudgePromptPath: join(sharedLogsDir, "optimizer-judge-prompt.txt"),
      chatHistoryPath: join(sharedLogsDir, "chat-history.jsonl"),
      memoryPath: join(sharedLogsDir, "memory-turns.jsonl"),
      apiConfigPath: join(dataDir, "config", "api.json"),
      browserSessionsRoot: join(dataDir, "computer-browser-sessions"),
      researchDir
    };
  }

  const userRoot = join(usersDir, safeUserId);
  const styleRoot = safeStyleId ? join(userRoot, "styles", safeStyleId) : userRoot;
  const configDir = join(userRoot, "config");
  const logsDir = safeStyleId ? join(styleRoot, "logs") : join(userRoot, "logs");
  const uploadsDir = join(userRoot, "uploads");
  const computerDir = join(userRoot, "computer");

  return {
    userId: safeUserId,
    styleProfileId: safeStyleId || null,
    userRoot,
    styleRoot,
    configDir,
    logsDir,
    uploadsDir,
    computerDir,
    computerStatePath: join(computerDir, "state.json"),
    computerWorkerPidPath: join(computerDir, "worker.pid"),
    optimizerProgressPath: join(logsDir, "optimizer-progress.json"),
    optimizerMemoryPath: join(logsDir, "optimizer-memory.jsonl"),
    optimizerPlaybookPath: join(logsDir, "optimizer-playbook.json"),
    optimizerJudgePromptPath: join(logsDir, "optimizer-judge-prompt.txt"),
    chatHistoryPath: join(logsDir, "chat-history.jsonl"),
    memoryPath: join(logsDir, "memory-turns.jsonl"),
    apiConfigPath: join(configDir, "api.json"),
    browserSessionsRoot: join(userRoot, "computer-browser-sessions"),
    researchDir
  };
}

export async function ensureRuntimeScopeDirs(scope = buildRuntimeScope()) {
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(scope.configDir, { recursive: true }),
    mkdir(scope.logsDir, { recursive: true }),
    mkdir(scope.uploadsDir, { recursive: true }),
    mkdir(scope.computerDir, { recursive: true }),
    mkdir(scope.browserSessionsRoot, { recursive: true }),
    mkdir(scope.researchDir, { recursive: true }),
    scope.userRoot && scope.userRoot !== dataDir
      ? mkdir(scope.userRoot, { recursive: true })
      : Promise.resolve()
  ]);
}
