import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { readJsonFileWithRecovery, writeJsonFileAtomic } from "./atomicFile.mjs";
import { projectRoot } from "./projectPaths.mjs";

const configDir = join(projectRoot, "config");
const localMailConfigPath = join(configDir, "mail.local.json");
const publicMailConfigPath = join(configDir, "mail.json");

const defaultMailConfig = {
  mode: "console",
  host: "",
  port: 587,
  secure: false,
  user: "",
  pass: "",
  from: "Hegel Salon <no-reply@example.com>"
};

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeMailConfig(input = {}) {
  return {
    mode: String(input.mode || defaultMailConfig.mode).trim() || "console",
    host: String(input.host || "").trim(),
    port: Number.parseInt(String(input.port || defaultMailConfig.port), 10) || 587,
    secure:
      input.secure === true ||
      String(input.secure || "").trim().toLowerCase() === "true",
    user: String(input.user || "").trim(),
    pass: String(input.pass || "").trim(),
    from: String(input.from || defaultMailConfig.from).trim() || defaultMailConfig.from
  };
}

export function isConsoleMailConfig(config = {}) {
  const normalized = normalizeMailConfig(config);
  return normalized.mode === "console" || !normalized.host;
}

export async function loadMailConfig() {
  const envConfig = normalizeMailConfig({
    mode: process.env.HEGEL_MAIL_MODE,
    host: process.env.HEGEL_SMTP_HOST,
    port: process.env.HEGEL_SMTP_PORT,
    secure: process.env.HEGEL_SMTP_SECURE,
    user: process.env.HEGEL_SMTP_USER,
    pass: process.env.HEGEL_SMTP_PASS,
    from: process.env.HEGEL_MAIL_FROM
  });

  if (envConfig.host || envConfig.user || envConfig.pass) {
    return {
      ...envConfig,
      mode: envConfig.mode === "console" ? "smtp" : envConfig.mode
    };
  }

  const configPath = existsSync(localMailConfigPath)
    ? localMailConfigPath
    : publicMailConfigPath;

  if (!existsSync(configPath)) {
    return { ...defaultMailConfig };
  }

  return readJsonFileWithRecovery(configPath, { ...defaultMailConfig }, {
    normalize: normalizeMailConfig,
    rewriteOnFailure: true
  });
}

export async function writeMailConfig(input = {}) {
  await mkdir(configDir, { recursive: true });
  const normalized = normalizeMailConfig(input);
  await writeJsonFileAtomic(localMailConfigPath, normalized);
  return normalized;
}

export async function sendTestMail({ to, config }) {
  return sendMail({
    to,
    subject: "Hegel Salon SMTP test",
    text: "This is a test email from Hegel Salon SMTP configuration.",
    html: "<p>This is a test email from <strong>Hegel Salon</strong> SMTP configuration.</p>",
    configOverride: config
  });
}

export async function sendMail({ to, subject, text, html, configOverride = null }) {
  const config = configOverride ? normalizeMailConfig(configOverride) : await loadMailConfig();

  if (config.mode === "console" || !config.host) {
    console.log(
      JSON.stringify(
        {
          kind: "mail-preview",
          to,
          subject,
          text
        },
        null,
        2
      )
    );
    return {
      mode: "console"
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? {
          user: config.user,
          pass: config.pass
        }
      : undefined
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text,
    html
  });

  return {
    mode: "smtp"
  };
}
