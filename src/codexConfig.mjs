import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(moduleDir, "..");
const codexRoot = process.env.CODEX_HOME || join(homedir(), ".codex");
const localConfigDir = join(projectRoot, "config");

function safeRead(path) {
  try {
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function parseJson(path) {
  const raw = safeRead(path);
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseEnvMap(path) {
  const raw = safeRead(path);
  const map = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!key) continue;
    map[key] = value;
  }

  return map;
}

function extractTomlSection(raw, sectionName) {
  const lines = raw.split(/\r?\n/);
  const body = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const currentSection = trimmed.slice(1, -1);
      if (inSection) break;
      inSection = currentSection === sectionName;
      continue;
    }

    if (inSection) body.push(line);
  }

  return body.join("\n");
}

function matchQuoted(raw, regex) {
  const match = raw.match(regex);
  return match ? match[1] : null;
}

function matchBoolean(raw, regex) {
  const match = raw.match(regex);
  if (!match) return null;
  return match[1] === "true";
}

function cleanValue(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function isPlaceholderValue(value) {
  const text = String(value || "").trim();
  if (!text) return true;

  return [
    "PASTE_YOUR_API_KEY_HERE",
    "PASTE_YOUR_BASE_URL_HERE",
    "PASTE_YOUR_MODEL_HERE",
    "YOUR_API_KEY",
    "YOUR_BASE_URL",
    "YOUR_MODEL"
  ].some((marker) => text.includes(marker));
}

function firstRealValue(...values) {
  for (const value of values) {
    const cleaned = cleanValue(value);
    if (!cleaned || isPlaceholderValue(cleaned)) continue;
    return cleaned;
  }

  return null;
}

export function loadCodexOpenAIConfig() {
  const configPath = join(codexRoot, "config.toml");
  const authPath = join(codexRoot, "auth.json");
  const envPath = join(codexRoot, "env.json");
  const localJsonPath = existsSync(join(localConfigDir, "api.local.json"))
    ? join(localConfigDir, "api.local.json")
    : join(localConfigDir, "api.json");
  const localEnvPath = join(projectRoot, ".env.local");

  const configRaw = safeRead(configPath);
  const auth = parseJson(authPath);
  const envMap = parseEnvMap(envPath);
  const localJson = parseJson(localJsonPath);
  const localEnv = parseEnvMap(localEnvPath);

  const provider =
    firstRealValue(
      localJson.provider,
      localJson.OPENAI_PROVIDER,
      localEnv.OPENAI_PROVIDER,
      process.env.OPENAI_PROVIDER,
      matchQuoted(configRaw, /^model_provider\s*=\s*"([^"]+)"/m)
    ) || "openai";

  const providerSection = extractTomlSection(
    configRaw,
    `model_providers.${provider}`
  );

  const envKey =
    firstRealValue(
      localJson.envKey,
      localJson.OPENAI_ENV_KEY,
      localEnv.OPENAI_ENV_KEY,
      matchQuoted(providerSection, /^env_key\s*=\s*"([^"]+)"/m)
    ) || "OPENAI_API_KEY";

  const model =
    firstRealValue(
      localJson.model,
      localJson.OPENAI_MODEL,
      localEnv.OPENAI_MODEL,
      process.env.OPENAI_MODEL,
      matchQuoted(configRaw, /^model\s*=\s*"([^"]+)"/m)
    ) || "gpt-5.4";

  const baseURL = firstRealValue(
    localJson.baseURL,
    localJson.baseUrl,
    localJson.OPENAI_BASE_URL,
    localEnv.OPENAI_BASE_URL,
    process.env.OPENAI_BASE_URL,
    matchQuoted(providerSection, /^base_url\s*=\s*"([^"]+)"/m)
  );

  const preferredAuth = firstRealValue(
    localJson.preferredAuthMethod,
    localJson.preferred_auth_method,
    matchQuoted(providerSection, /^preferred_auth_method\s*=\s*"([^"]+)"/m)
  );

  const requiresOpenAIAuth =
    typeof localJson.requiresOpenAIAuth === "boolean"
      ? localJson.requiresOpenAIAuth
      : matchBoolean(providerSection, /^requires_openai_auth\s*=\s*(true|false)/m);

  const apiKey =
    firstRealValue(
      localJson.apiKey,
      localJson[envKey],
      localJson.OPENAI_API_KEY,
      localEnv[envKey],
      localEnv.OPENAI_API_KEY,
      preferredAuth,
      auth[envKey],
      auth.OPENAI_API_KEY,
      envMap[envKey],
      envMap.OPENAI_API_KEY,
      process.env[envKey],
      process.env.OPENAI_API_KEY
    ) || (requiresOpenAIAuth === false ? "codex-local" : null);

  return {
    provider,
    model,
    baseURL,
    apiKey,
    envKey,
    requiresOpenAIAuth
  };
}

export function loadCodexResponsesFallbackConfig() {
  const configPath = join(codexRoot, "config.toml");
  const authPath = join(codexRoot, "auth.json");
  const envPath = join(codexRoot, "env.json");

  const configRaw = safeRead(configPath);
  const auth = parseJson(authPath);
  const envMap = parseEnvMap(envPath);

  const provider =
    firstRealValue(matchQuoted(configRaw, /^model_provider\s*=\s*"([^"]+)"/m)) || "OpenAI";

  const providerSection = extractTomlSection(
    configRaw,
    `model_providers.${provider}`
  );

  const envKey =
    firstRealValue(
      matchQuoted(providerSection, /^env_key\s*=\s*"([^"]+)"/m)
    ) || "OPENAI_API_KEY";

  const model =
    firstRealValue(
      process.env.OPENAI_MODEL,
      matchQuoted(configRaw, /^model\s*=\s*"([^"]+)"/m)
    ) || "gpt-5.4";

  const baseURL =
    firstRealValue(
      process.env.OPENAI_BASE_URL,
      matchQuoted(providerSection, /^base_url\s*=\s*"([^"]+)"/m)
    ) || "https://api.openai.com/v1";

  const requiresOpenAIAuth = matchBoolean(
    providerSection,
    /^requires_openai_auth\s*=\s*(true|false)/m
  );

  const apiKey =
    firstRealValue(
      auth[envKey],
      auth.OPENAI_API_KEY,
      envMap[envKey],
      envMap.OPENAI_API_KEY,
      process.env[envKey],
      process.env.OPENAI_API_KEY
    ) || (requiresOpenAIAuth === false ? "codex-local" : null);

  return {
    provider,
    model,
    baseURL,
    apiKey,
    envKey,
    requiresOpenAIAuth
  };
}
