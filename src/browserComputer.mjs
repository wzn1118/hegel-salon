import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import { loadCodexOpenAIConfig, loadCodexResponsesFallbackConfig } from "./codexConfig.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_DEBUG_PORT = 9333;
const WIDTH = 1280;
const HEIGHT = 900;
const MAX_STEPS = 10;
const EDGE_CANDIDATES = [
  String(process.env.HEGEL_EDGE_PATH || "").trim(),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(task, timeoutMs, onTimeout) {
  let timer = null;

  try {
    return await Promise.race([
      task,
      new Promise((resolve) => {
        timer = setTimeout(async () => {
          resolve(await onTimeout());
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function findEdgePath() {
  return EDGE_CANDIDATES.find((path) => existsSync(path)) || null;
}

function readEnvOverride(key) {
  const value = String(process.env[key] || "").trim();
  return value || null;
}

function resolveComputerConfig() {
  const envConfig = {
    provider: readEnvOverride("OPENAI_PROVIDER") || "openai",
    model: readEnvOverride("OPENAI_MODEL") || "gpt-5.4",
    baseURL: readEnvOverride("OPENAI_BASE_URL"),
    apiKey: readEnvOverride("OPENAI_API_KEY")
  };
  if (envConfig.apiKey && envConfig.baseURL) {
    return envConfig;
  }

  const config = loadCodexOpenAIConfig();
  if (config?.apiKey && config?.baseURL) {
    return {
      ...envConfig,
      ...config,
      model: config.model || envConfig.model || "gpt-5.4"
    };
  }

  const fallback = loadCodexResponsesFallbackConfig();
  if (fallback?.apiKey && fallback?.baseURL) {
    return {
      ...envConfig,
      ...fallback,
      model: fallback.model || envConfig.model || "gpt-5.4"
    };
  }

  return {
    ...envConfig,
    ...fallback,
    ...config,
    model: config?.model || fallback?.model || envConfig.model || "gpt-5.4"
  };
}

class CDPConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl);
      this.socket = socket;

      const cleanup = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
      };

      const onOpen = () => {
        cleanup();
        resolve();
      };

      const onError = (event) => {
        cleanup();
        reject(event.error || new Error("Failed to connect to browser debugger."));
      };

      socket.addEventListener("open", onOpen);
      socket.addEventListener("error", onError);
      socket.addEventListener("message", (event) => this.#handleMessage(event));
      socket.addEventListener("close", () => {
        for (const { reject: pendingReject } of this.pending.values()) {
          pendingReject(new Error("Browser debugger connection closed."));
        }
        this.pending.clear();
      });
    });
  }

  #handleMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "CDP command failed."));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }

    if (!message.method) {
      return;
    }

    const handlers = this.listeners.get(message.method);
    if (!handlers) {
      return;
    }

    handlers.forEach((handler) => handler(message.params || {}));
  }

  async send(method, params = {}) {
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitForEvent(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for browser event ${method}.`));
      }, timeoutMs);

      const handler = (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      };

      const off = () => {
        const list = this.listeners.get(method) || [];
        this.listeners.set(
          method,
          list.filter((item) => item !== handler)
        );
      };

      const list = this.listeners.get(method) || [];
      list.push(handler);
      this.listeners.set(method, list);
    });
  }

  async close() {
    if (!this.socket) {
      return;
    }

    this.socket.close();
    this.socket = null;
  }
}

class BrowserEnvironment {
  constructor(options = {}) {
    this.debugPort = Number(options.debugPort || DEFAULT_DEBUG_PORT);
    this.profileRoot = options.profileRoot || join(process.cwd(), "data", "computer-browser-sessions");
    this.process = null;
    this.profileDir = null;
    this.cdp = null;
    this.started = false;
  }

  async ensureStarted() {
    if (this.started && this.cdp) {
      return;
    }

    const edgePath = findEdgePath();
    if (!edgePath) {
      throw new Error("Microsoft Edge was not found on this machine.");
    }

    this.profileDir = join(this.profileRoot, randomUUID());
    await mkdir(this.profileDir, { recursive: true });

    this.process = spawn(
      edgePath,
      [
        `--remote-debugging-port=${this.debugPort}`,
        `--user-data-dir=${this.profileDir}`,
        `--window-size=${WIDTH},${HEIGHT}`,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--mute-audio",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
      ],
      {
        stdio: "ignore",
        windowsHide: true
      }
    );

    let wsUrl = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.debugPort}/json/list`);
        const pages = await response.json();
        const page = Array.isArray(pages) ? pages.find((item) => item.type === "page") : null;
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch {
        // Keep polling.
      }

      await sleep(300);
    }

    if (!wsUrl) {
      throw new Error("Failed to start the local browser environment.");
    }

    this.cdp = new CDPConnection(wsUrl);
    await this.cdp.connect();
    await this.cdp.send("Page.enable");
    await this.cdp.send("Runtime.enable");
    await this.cdp.send("Network.enable");
    await this.cdp.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: WIDTH,
      screenHeight: HEIGHT
    });

    this.started = true;
  }

  async navigate(url) {
    if (!url) {
      return;
    }

    await this.ensureStarted();
    await this.cdp.send("Page.navigate", { url });
    await Promise.race([
      this.cdp.waitForEvent("Page.loadEventFired", 12000),
      sleep(1800)
    ]);
    await sleep(400);
  }

  async captureScreenshot() {
    await this.ensureStarted();
    const { data } = await this.cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 70,
      fromSurface: true
    });
    return `data:image/jpeg;base64,${data}`;
  }

  async getLocation() {
    await this.ensureStarted();
    const { result } = await this.cdp.send("Runtime.evaluate", {
      expression:
        "JSON.stringify({ url: location.href, title: document.title || '', text: document.body ? document.body.innerText.slice(0, 1000) : '' })",
      returnByValue: true
    });

    try {
      return JSON.parse(result.value || "{}");
    } catch {
      return { url: "", title: "", text: "" };
    }
  }

  async getPlanningSnapshot() {
    await this.ensureStarted();
    const { result } = await this.cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const isVisible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none';
        };

        const elements = Array.from(
          document.querySelectorAll('a, button, input, textarea, select, [role="button"], [onclick]')
        )
          .filter(isVisible)
          .slice(0, 60)
          .map((element, index) => {
            const rect = element.getBoundingClientRect();
            const text = (element.innerText || element.value || element.getAttribute('aria-label') || element.getAttribute('title') || '').replace(/\\s+/g, ' ').trim();
            return {
              index,
              tag: element.tagName.toLowerCase(),
              type: element.getAttribute('type') || '',
              text: text.slice(0, 120),
              placeholder: (element.getAttribute('placeholder') || '').slice(0, 80),
              href: (element.getAttribute('href') || '').slice(0, 200),
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            };
          });

        return {
          url: location.href,
          title: document.title || '',
          text: document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 5000) : '',
          elements
        };
      })())`,
      returnByValue: true
    });

    try {
      return JSON.parse(result.value || "{}");
    } catch {
      return {
        url: "",
        title: "",
        text: "",
        elements: []
      };
    }
  }

  async performAction(action) {
    await this.ensureStarted();
    const current = action || {};
    const type = current.type;

    switch (type) {
      case "click":
        await this.#click(current.x, current.y, current.button || "left", 1);
        break;
      case "double_click":
        await this.#click(current.x, current.y, "left", 2);
        break;
      case "move":
        await this.#mouseMove(current.x, current.y);
        break;
      case "scroll":
        await this.cdp.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: current.x || 0,
          y: current.y || 0,
          deltaX: current.scroll_x || 0,
          deltaY: current.scroll_y || 0
        });
        break;
      case "type":
        await this.cdp.send("Input.insertText", { text: current.text || "" });
        break;
      case "keypress":
        await this.#keypress(current.keys || []);
        break;
      case "drag":
        await this.#drag(current.path || []);
        break;
      case "wait":
        await sleep(1200);
        break;
      case "screenshot":
        break;
      default:
        throw new Error(`Unsupported browser action: ${type}`);
    }

    await sleep(400);
  }

  async #mouseMove(x, y) {
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none"
    });
  }

  async #click(x, y, button = "left", clickCount = 1) {
    await this.#mouseMove(x, y);
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button,
      clickCount
    });
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button,
      clickCount
    });
  }

  async #drag(path) {
    if (!Array.isArray(path) || path.length < 2) {
      return;
    }

    const first = path[0];
    await this.#mouseMove(first.x, first.y);
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: first.x,
      y: first.y,
      button: "left",
      clickCount: 1
    });

    for (const point of path.slice(1)) {
      await this.#mouseMove(point.x, point.y);
      await sleep(60);
    }

    const last = path[path.length - 1];
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: last.x,
      y: last.y,
      button: "left",
      clickCount: 1
    });
  }

  async #keypress(keys) {
    const normalized = Array.isArray(keys) ? keys.map(normalizeKey).filter(Boolean) : [];
    if (!normalized.length) {
      return;
    }

    const modifierKeys = normalized.filter((key) => MODIFIER_BITS[key]);
    const mainKey = normalized.find((key) => !MODIFIER_BITS[key]) || normalized[normalized.length - 1];
    const modifiers = modifierKeys.reduce((mask, key) => mask | MODIFIER_BITS[key], 0);

    for (const key of modifierKeys) {
      await this.cdp.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key,
        code: keyCodeFor(key),
        windowsVirtualKeyCode: virtualKeyFor(key),
        modifiers
      });
    }

    if (mainKey.length === 1 && !MODIFIER_BITS[mainKey]) {
      await this.cdp.send("Input.insertText", { text: mainKey });
    } else {
      await this.cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: mainKey,
        code: keyCodeFor(mainKey),
        windowsVirtualKeyCode: virtualKeyFor(mainKey),
        modifiers
      });
      await this.cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: mainKey,
        code: keyCodeFor(mainKey),
        windowsVirtualKeyCode: virtualKeyFor(mainKey),
        modifiers
      });
    }

    for (const key of [...modifierKeys].reverse()) {
      await this.cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: keyCodeFor(key),
        windowsVirtualKeyCode: virtualKeyFor(key),
        modifiers
      });
    }
  }

  async reset() {
    if (this.cdp) {
      await this.cdp.close();
      this.cdp = null;
    }

    if (this.process?.pid) {
      try {
        await execFileAsync("taskkill", ["/PID", String(this.process.pid), "/T", "/F"]);
      } catch {
        try {
          this.process.kill("SIGKILL");
        } catch {
          // Ignore cleanup failures.
        }
      }
    }

    if (this.profileDir) {
      try {
        await rm(this.profileDir, { recursive: true, force: true });
      } catch {
        // Ignore profile cleanup failures on Windows file locks.
      }
    }

    this.process = null;
    this.profileDir = null;
    this.started = false;
  }
}

const MODIFIER_BITS = {
  Alt: 1,
  Control: 2,
  Meta: 4,
  Shift: 8
};

function normalizeKey(key) {
  const value = String(key || "").trim();
  const aliases = {
    CTRL: "Control",
    CONTROL: "Control",
    CMD: "Meta",
    COMMAND: "Meta",
    ESC: "Escape",
    RETURN: "Enter",
    OPTION: "Alt",
    SPACE: " ",
    UP: "ArrowUp",
    DOWN: "ArrowDown",
    LEFT: "ArrowLeft",
    RIGHT: "ArrowRight"
  };

  return aliases[value.toUpperCase()] || value;
}

function keyCodeFor(key) {
  const map = {
    Enter: "Enter",
    Tab: "Tab",
    Escape: "Escape",
    Backspace: "Backspace",
    Control: "ControlLeft",
    Shift: "ShiftLeft",
    Alt: "AltLeft",
    Meta: "MetaLeft",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight"
  };

  if (map[key]) {
    return map[key];
  }

  if (/^[a-z]$/i.test(key)) {
    return `Key${key.toUpperCase()}`;
  }

  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }

  return key;
}

function virtualKeyFor(key) {
  const map = {
    Enter: 13,
    Tab: 9,
    Escape: 27,
    Backspace: 8,
    Control: 17,
    Shift: 16,
    Alt: 18,
    Meta: 91,
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39
  };

  if (map[key]) {
    return map[key];
  }

  if (/^[a-z]$/i.test(key)) {
    return key.toUpperCase().charCodeAt(0);
  }

  if (/^[0-9]$/.test(key)) {
    return key.charCodeAt(0);
  }

  return 0;
}

function extractFirstUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s"'`]+/i);
  return match ? match[0] : "";
}

function normalizeUrlForCompare(url) {
  return String(url || "").replace(/\/+$/, "").toLowerCase();
}

function isTitleReadTask(text) {
  const normalized = String(text || "");
  return /page title|title|标题|题名/i.test(normalized);
}

function buildFallbackDecision({ task, snapshot }) {
  const rawTask = String(task || "").trim();
  const loweredTask = rawTask.toLowerCase();
  const currentUrl = String(snapshot?.url || "");
  const title = String(snapshot?.title || "").trim();
  const explicitUrl = extractFirstUrl(rawTask);
  const normalizedCurrent = normalizeUrlForCompare(currentUrl);
  const normalizedExplicit = normalizeUrlForCompare(explicitUrl);

  if (explicitUrl && normalizedCurrent && normalizedCurrent !== normalizedExplicit) {
    return {
      reasoning: "The task explicitly names a target URL, so I should navigate there first.",
      action: {
        type: "navigate",
        url: explicitUrl
      }
    };
  }

  if (
    explicitUrl &&
    normalizedCurrent &&
    normalizedCurrent.startsWith(normalizedExplicit) &&
    /(then stop|stop once|停下|停止|打开后停|到达后停)/i.test(rawTask)
  ) {
    return {
      reasoning: "The requested site is already open, and the task explicitly says to stop once it is open.",
      action: {
        type: "finish",
        final_answer: `我已抵达所要求的页面：${title || currentUrl}。`
      }
    };
  }

  if (/(page title|title|标题|题名)/i.test(rawTask) && title) {
    return {
      reasoning: "The task only asks for the page title, and the title is already known from the current page.",
      action: {
        type: "finish",
        final_answer: `我把握此页之题名：${title}。`
      }
    };
  }

  return null;
}

export class BrowserComputerController {
  constructor(options = {}) {
    this.browser = new BrowserEnvironment(options);
    this.currentTask = null;
    this.runningPromise = null;
    this.runEpoch = 0;
    this.lastState = {
      status: "idle",
      screenshot: null,
      currentUrl: "",
      title: "",
      transcript: [],
      finalText: ""
    };
  }

  async reset() {
    this.runEpoch += 1;
    this.runningPromise = null;
    await this.browser.reset();
    this.lastState = {
      status: "idle",
      screenshot: null,
      currentUrl: "",
      title: "",
      transcript: [],
      finalText: ""
    };
    return this.lastState;
  }

  getState() {
    return this.lastState;
  }

  startTask({ task, startUrl }) {
    if (this.runningPromise) {
      return this.lastState;
    }

    const epoch = ++this.runEpoch;

    this.lastState = {
      status: "running",
      screenshot: this.lastState.screenshot,
      currentUrl: this.lastState.currentUrl,
      title: this.lastState.title,
      transcript: [],
      finalText: ""
    };

    this.runningPromise = this.runTask({ task, startUrl, epoch })
      .catch((error) => {
        if (epoch !== this.runEpoch) {
          return this.lastState;
        }
        this.lastState = {
          ...this.lastState,
          status: "failed",
          transcript: [
            ...(Array.isArray(this.lastState.transcript) ? this.lastState.transcript : []),
            `Error: ${error instanceof Error ? error.message : String(error)}`
          ],
          finalText: ""
        };
        return this.lastState;
      })
      .finally(() => {
        if (epoch === this.runEpoch) {
          this.runningPromise = null;
        }
      });

    return this.lastState;
  }

  async runTask({ task, startUrl, epoch }) {
    const prompt = String(task || "").trim();
    if (!prompt) {
      throw new Error("Please provide a browser task.");
    }

    const config = resolveComputerConfig();
    const primaryClient = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
    const alternateConfig = loadCodexOpenAIConfig();
    const fallbackClient =
      alternateConfig?.apiKey &&
      alternateConfig?.baseURL &&
      alternateConfig.baseURL !== config.baseURL
        ? new OpenAI({
            apiKey: alternateConfig.apiKey,
            baseURL: alternateConfig.baseURL
          })
        : null;

    await this.browser.ensureStarted();
    if (startUrl) {
      await this.browser.navigate(startUrl);
    }

    if (epoch !== this.runEpoch) {
      return this.lastState;
    }

    let screenshot = await this.browser.captureScreenshot();
    let location = await this.browser.getLocation();
    const transcript = [];
    let currentUrl = location.url || "";
    let title = location.title || "";

    if (isTitleReadTask(prompt) && !title) {
      for (let retry = 0; retry < 5; retry += 1) {
        await sleep(300);
        location = await this.browser.getLocation();
        currentUrl = location.url || currentUrl;
        title = location.title || title;
        if (title) {
          break;
        }
      }
    }

    if (isTitleReadTask(prompt) && title) {
      this.lastState = {
        status: "completed",
        screenshot,
        currentUrl,
        title,
        transcript: [
          "思路: 这是一个读取页面标题的直接任务，当前页面标题已经可以本地确定。",
          `动作: ${JSON.stringify({ type: "finish", final_answer: `我把握此页之题名：${title}。` })}`
        ],
        finalText: `我把握此页之题名：${title}。`
      };
      return this.lastState;
    }

    this.lastState = {
      status: "running",
      screenshot,
      currentUrl,
      title,
      transcript: [],
      finalText: ""
    };

    for (let step = 0; step < MAX_STEPS; step += 1) {
      const snapshot = await withTimeout(
        this.browser.getPlanningSnapshot(),
        3000,
        async () => {
          transcript.push("修正: 结构化页面快照超时，已退回轻量页面快照。");
          const light = await this.browser.getLocation();
          return {
            url: light.url || "",
            title: light.title || "",
            text: light.text || "",
            elements: []
          };
        }
      );
      if (epoch !== this.runEpoch) {
        return this.lastState;
      }

      const fallbackDecision = buildFallbackDecision({
        task: prompt,
        snapshot
      });

      if (fallbackDecision) {
        const action = fallbackDecision.action || {};
        const type = String(action.type || "");
        transcript.push(`思路: ${fallbackDecision.reasoning}`);
        transcript.push(`动作: ${JSON.stringify(action)}`);
        this.lastState = {
          status: "running",
          screenshot,
          currentUrl,
          title,
          transcript: [...transcript],
          finalText: ""
        };

        if (type === "finish") {
          this.lastState = {
            status: "completed",
            screenshot,
            currentUrl,
            title,
            transcript,
            finalText: String(action.final_answer || "我已把对象规定为完成。")
          };
          return this.lastState;
        }

        const result = await this.#performPlannerAction(action, snapshot);
        if (!result.ok) {
          this.lastState = {
            status: "failed",
            screenshot,
            currentUrl,
            title,
            transcript: [...transcript, `Error: ${result.message}`],
            finalText: ""
          };
          return this.lastState;
        }

        screenshot = await this.browser.captureScreenshot();
        location = await this.browser.getLocation();
        currentUrl = location.url || currentUrl;
        title = location.title || title;
        this.lastState = {
          status: "running",
          screenshot,
          currentUrl,
          title,
          transcript: [...transcript],
          finalText: ""
        };
        continue;
      }

      const plannerMessages = [
        {
          role: "system",
          content: [
            "You control a browser for the user.",
            "Decide exactly one next action in strict JSON.",
            "Prefer click/type/scroll/navigation actions over commentary.",
            "If the task is complete, return finish with a short final_answer.",
            "The final_answer is user-facing and must be written in a Hegelian first-person voice.",
            "By default, write the final_answer in Chinese unless the task explicitly asks for another language.",
            "The final_answer should not sound like a generic browser agent report; it should sound as if Hegel himself briefly reports what he has found.",
            "Allowed action types:",
            "- click_element { element_index }",
            "- type_element { element_index, text }",
            "- scroll_page { delta_y }",
            "- press_keys { keys }",
            "- navigate { url }",
            "- wait {}",
            "- finish { final_answer }",
            "Return JSON only with this shape:",
            '{"reasoning":"...", "action":{"type":"...", "...": "..."} }'
          ].join("\n")
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  task: prompt,
                  step,
                  current_url: snapshot.url,
                  title: snapshot.title,
                  visible_text: snapshot.text,
                  valid_element_indices: snapshot.elements.map((element) => element.index),
                  elements: snapshot.elements,
                  previous_actions: transcript.slice(-8)
                },
                null,
                2
              )
            },
            {
              type: "image_url",
              image_url: {
                url: screenshot
              }
            }
          ]
        }
      ];

      transcript.push("思路: 我先以当前页面截图与结构化快照来规定对象。");
      this.lastState = {
        status: "running",
        screenshot,
        currentUrl,
        title,
        transcript: [...transcript],
        finalText: ""
      };

      const completionResult = await createPlannerCompletion({
        primaryClient,
        fallbackClient,
        model: config.model,
        messages: plannerMessages
      });
      const completion = completionResult.completion;

      if (completionResult.mode === "text-only") {
        transcript.push("修正: 图像规划超时，已退回文本快照规划。");
      }

      if (epoch !== this.runEpoch) {
        return this.lastState;
      }

      const raw = String(completion.choices?.[0]?.message?.content || "").trim();
      const decision = extractJsonObject(raw);
      const action = decision?.action || {};
      const type = String(action.type || "");

      transcript.push(`思路: ${String(decision?.reasoning || "").trim() || "(无)"}`);
      transcript.push(`动作: ${JSON.stringify(action)}`);
      this.lastState = {
        status: "running",
        screenshot,
        currentUrl,
        title,
        transcript: [...transcript],
        finalText: ""
      };

      if (type === "finish") {
        this.lastState = {
          status: "completed",
          screenshot,
          currentUrl,
          title,
          transcript,
          finalText: String(
            action.final_answer ||
              decision.final_answer ||
              "我已完成这一浏览任务，并把对象规定为可理解的内容。"
          )
        };
        return this.lastState;
      }

      const actionResult = await this.#performPlannerAction(action, snapshot);
      if (!actionResult.ok) {
        transcript.push(`修正: ${actionResult.message}`);
        this.lastState = {
          status: "running",
          screenshot,
          currentUrl,
          title,
          transcript: [...transcript],
          finalText: ""
        };
        continue;
      }
      if (epoch !== this.runEpoch) {
        return this.lastState;
      }
      screenshot = await this.browser.captureScreenshot();
      location = await this.browser.getLocation();
      currentUrl = location.url || currentUrl;
      title = location.title || title;
      this.lastState = {
        status: "running",
        screenshot,
        currentUrl,
        title,
        transcript: [...transcript],
        finalText: ""
      };
    }

    this.lastState = {
      status: "stopped",
      screenshot,
      currentUrl,
      title,
      transcript: [...transcript, "动作流在当前步限处暂停。"],
      finalText: "我已经推进到当前步限；对象尚未穷尽，但路径已经打开。"
    };
    return this.lastState;
  }

  async #performPlannerAction(action, snapshot) {
    const type = String(action?.type || "");

    if (type === "navigate") {
      await this.browser.navigate(String(action.url || "").trim());
      return { ok: true };
    }

    if (type === "scroll_page") {
      await this.browser.performAction({
        type: "scroll",
        x: WIDTH / 2,
        y: HEIGHT / 2,
        scroll_x: 0,
        scroll_y: Number(action.delta_y || 700)
      });
      return { ok: true };
    }

    if (type === "press_keys") {
      await this.browser.performAction({
        type: "keypress",
        keys: Array.isArray(action.keys) ? action.keys : []
      });
      return { ok: true };
    }

    if (type === "wait") {
      await this.browser.performAction({ type: "wait" });
      return { ok: true };
    }

    const index = Number(action.element_index);
    const target = Array.isArray(snapshot.elements)
      ? snapshot.elements.find((element) => element.index === index)
      : null;

    if (!target) {
      return {
        ok: false,
        message: `模型选择了不存在的元素索引 ${action.element_index}，已忽略并要求其重新判断。`
      };
    }

    if (type === "click_element") {
      await this.browser.performAction({
        type: "click",
        x: target.x,
        y: target.y,
        button: "left"
      });
      return { ok: true };
    }

    if (type === "type_element") {
      await this.browser.performAction({
        type: "click",
        x: target.x,
        y: target.y,
        button: "left"
      });
      await this.browser.performAction({
        type: "keypress",
        keys: ["Control", "A"]
      });
      await this.browser.performAction({
        type: "type",
        text: String(action.text || "")
      });
      return { ok: true };
    }

    return {
      ok: false,
      message: `模型给出了未支持的动作 ${type}，已忽略并要求其重新判断。`
    };
  }
}

function removeImageParts(messages) {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) {
      return message;
    }

    return {
      ...message,
      content: message.content.filter((part) => part.type !== "image_url")
    };
  });
}

async function createPlannerCompletion({ primaryClient, fallbackClient, model, messages }) {
  try {
    const completion = await createPlannerCompletionOnce({
      client: primaryClient,
      model,
      messages,
      timeoutMs: 12000
    });
    return { completion, mode: "vision" };
  } catch (error) {
    const strippedMessages = removeImageParts(messages);
    try {
      const completion = await createPlannerCompletionOnce({
        client: primaryClient,
        model,
        messages: strippedMessages,
        timeoutMs: 12000
      });
      return { completion, mode: "text-only" };
    } catch (innerError) {
      if (!fallbackClient) {
        throw innerError;
      }

      const completion = await createPlannerCompletionOnce({
        client: fallbackClient,
        model,
        messages: strippedMessages,
        timeoutMs: 12000
      });
      return { completion, mode: "text-only" };
    }
  }
}

async function createPlannerCompletionOnce({ client, model, messages, timeoutMs }) {
  return Promise.race([
    client.chat.completions.create({
      model,
      messages,
      temperature: 0.2
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Planner request timed out.")), timeoutMs)
    )
  ]);
}

function extractJsonObject(raw) {
  const text = String(raw || "").trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Browser agent returned no JSON action.");
  }

  return JSON.parse(text.slice(firstBrace, lastBrace + 1));
}
