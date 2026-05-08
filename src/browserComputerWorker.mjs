import { writeFile } from "node:fs/promises";
import { BrowserComputerController } from "./browserComputer.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--")) {
      continue;
    }
    args[key.slice(2)] = value || "";
  }
  return args;
}

async function writeState(path, state) {
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

const args = parseArgs(process.argv);
const statePath = args["state-path"];
const task = args["task"] || "";
const startUrl = args["start-url"] || "";
const debugPort = Number(args["debug-port"] || 9333);
const profileRoot = args["profile-root"] || "";

if (!statePath) {
  throw new Error("Missing --state-path for browser computer worker.");
}

const controller = new BrowserComputerController({
  debugPort,
  profileRoot: profileRoot || undefined
});

async function flushCurrentState() {
  await writeState(statePath, controller.getState());
}

process.on("uncaughtException", async (error) => {
  await writeState(statePath, {
    ...controller.getState(),
    status: "failed",
    transcript: [
      ...(controller.getState().transcript || []),
      `Error: ${error instanceof Error ? error.message : String(error)}`
    ],
    finalText: ""
  });
  process.exit(1);
});

process.on("unhandledRejection", async (error) => {
  await writeState(statePath, {
    ...controller.getState(),
    status: "failed",
    transcript: [
      ...(controller.getState().transcript || []),
      `Error: ${error instanceof Error ? error.message : String(error)}`
    ],
    finalText: ""
  });
  process.exit(1);
});

const interval = setInterval(() => {
  flushCurrentState().catch(() => {
    // Ignore transient write failures.
  });
}, 700);

controller.startTask({ task, startUrl });
await flushCurrentState();

while (true) {
  const state = controller.getState();
  if (state.status !== "running" && state.status !== "idle") {
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

clearInterval(interval);
await flushCurrentState();
