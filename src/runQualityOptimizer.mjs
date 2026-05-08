import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFileAtomic } from "./atomicFile.mjs";
import { loadCodexOpenAIConfig } from "./codexConfig.mjs";
import {
  buildDistilledStyleSummaryFromPlaybook,
  readOptimizerJudgePrompt,
  writeOptimizerPlaybook
} from "./optimizerMemory.mjs";
import { buildRuntimeScope } from "./runtimeScope.mjs";
import { updateStyleProfileById } from "./userDatabase.mjs";

const apiUrl = process.env.HEGEL_API_URL || "http://127.0.0.1:3088/api/chat";
const userId = process.env.HEGEL_USER_ID || "";
const styleProfileId = process.env.HEGEL_STYLE_PROFILE_ID || "";
const sessionToken = process.env.HEGEL_SESSION_TOKEN || "";
const scope = buildRuntimeScope(userId || null, styleProfileId || null);
const progressPath = scope.optimizerProgressPath;
const customPromptPath =
  process.env.HEGEL_OPTIMIZER_PROMPTS || join("training", "prompts.jsonl");
const targetScore =
  Number.parseFloat(process.env.HEGEL_OPTIMIZER_TARGET || "9.0") || 9.0;
const iterations =
  Number.parseInt(process.env.HEGEL_OPTIMIZER_ITERATIONS || "24", 10) || 24;
const concurrency =
  Number.parseInt(process.env.HEGEL_OPTIMIZER_CONCURRENCY || "2", 10) || 2;
const timeoutMs =
  Number.parseInt(process.env.HEGEL_OPTIMIZER_TIMEOUT_MS || "300000", 10) || 300000;

function resolveOptimizerModelConfig() {
  const inherited = loadCodexOpenAIConfig();
  return {
    provider: String(process.env.OPENAI_PROVIDER || inherited.provider || "").trim() || "openai",
    model: String(process.env.OPENAI_MODEL || inherited.model || "").trim(),
    baseURL: String(process.env.OPENAI_BASE_URL || inherited.baseURL || "").trim(),
    apiKey: String(process.env.OPENAI_API_KEY || inherited.apiKey || "").trim()
  };
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMessageText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("");
  }
  return "";
}

function parseJsonObject(rawText) {
  const raw = String(rawText || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end < start) {
    return {};
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return {};
  }
}

function buildPromptPool() {
  return [
    { kind: "concept", prompt: "自由为什么不是任意选择？不要套话，要显性化前提与反对意见。" },
    { kind: "concept", prompt: "意志为什么不能等于欲望？请把概念、推理与反对意见说清楚。" },
    { kind: "concept", prompt: "实体同样是主体为什么不是空洞口号？请给出严格论证。" },
    { kind: "concept", prompt: "概念为什么不是空形式？请避免抽象大词空转。" },
    { kind: "audit", prompt: "请按严格形式逻辑修订：法的理念是自由，所以凡是法都是自由。国家既然是法的现实化，所以国家的一切规定也都是自由。" },
    { kind: "audit", prompt: "请按严格形式逻辑修订：只要一个人不断否定流行意见，他就已经具有哲学意义。因为否定比肯定更深刻，所以强烈批评本身就是真理。" },
    { kind: "historical", prompt: "如何评价一位强调中心统合的当代大国领导者？必须引用历史来理解现实，明确类比边界，不要停在公共评论。" },
    { kind: "historical", prompt: "如何理解一位在民选体制下造成高度极化的当代领袖现象？请用历史形式分析现实，并明确类比边界。" },
    { kind: "historical", prompt: "如何理解当代大国的国家能力？请结合历史与制度媒介，而不是停留在一般评论。"},
    { kind: "historical", prompt: "如何理解现代官僚体系的忠诚逻辑？必须区分现实对象、历史形式和类比极限。"}
  ];
}

async function loadCustomPromptPool() {
  const path = join(process.cwd(), customPromptPath);
  if (!existsSync(path)) {
    return [];
  }

  const raw = await readFile(path, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const prompts = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === "string") {
        prompts.push({ kind: "concept", prompt: normalizeWhitespace(parsed) });
        continue;
      }

      if (parsed && typeof parsed.prompt === "string") {
        prompts.push({
          kind: typeof parsed.kind === "string" ? parsed.kind : "concept",
          prompt: normalizeWhitespace(parsed.prompt)
        });
      }
    } catch {
      const prompt = normalizeWhitespace(line);
      if (prompt) {
        prompts.push({ kind: "concept", prompt });
      }
    }
  }

  return prompts.filter((item) => item.prompt);
}

function buildFallbackPlaybook(failures = []) {
  const kinds = new Set((Array.isArray(failures) ? failures : []).map((item) => item?.kind).filter(Boolean));
  return {
    general: [
      "State the thesis in one sentence before elaboration.",
      "Make premises explicit before drawing the conclusion.",
      "Answer the exact question and keep each paragraph doing one inferential job."
    ],
    concept: kinds.has("concept")
      ? [
          "Define each key concept against nearby alternatives.",
          "Keep the same concept-stability throughout the answer."
        ]
      : [],
    audit: kinds.has("audit")
      ? [
          "Check for hidden premises and concept jumps before finalizing.",
          "Flag source status honestly when citing."
        ]
      : [],
    historical: kinds.has("historical")
      ? [
          "Mark analogy boundaries explicitly.",
          "Distinguish present object from historical form."
        ]
      : []
  };
}

function scoreResult(result) {
  const q = result?.qualityJudge || {};
  const s = result?.strictLogicJudge || {};
  const h = result?.historiographyJudge || {};

  const quality =
    (Number(q.overall || 0) +
      Number(q.formal_logic || 0) +
      Number(q.concept_precision || 0) +
      Number(q.argumentative_force || 0)) / 4;
  const strict =
    (Number(s.formal_logic || 0) +
      Number(s.premise_visibility || 0) +
      Number(s.step_validity || 0) +
      Number(s.no_large_leaps || 0)) / 4;
  const hist =
    h && Object.keys(h).length
      ? (Number(h.overall || 0) +
          Number(h.chronology_discipline || 0) +
          Number(h.source_status_honesty || 0) +
          Number(h.analogy_limit || 0)) / 4
      : quality;

  return Number((quality * 0.45 + strict * 0.35 + hist * 0.20).toFixed(2));
}

async function requestSalon(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(sessionToken
          ? {
              Cookie: `hegel_salon_session=${encodeURIComponent(sessionToken)}`
            }
          : {})
      },
      body: JSON.stringify({
        optimizerMode: true,
        styleProfileId: styleProfileId || "",
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`chat failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizePlaybook(config, failures) {
  const customJudgePrompt = await readOptimizerJudgePrompt(userId || null, styleProfileId || null);
  const response = await fetch(
    new URL("chat/completions", `${String(config.baseURL).replace(/\/+$/, "")}/`).toString(),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You are synthesizing a concise optimizer playbook for a Hegel salon.",
              "Return JSON only.",
              `Focus on failure patterns that would raise answers toward ${targetScore}/10.`,
              customJudgePrompt
                ? `User-custom training prompt:\n${customJudgePrompt}`
                : "No user-custom training prompt was supplied."
            ].join("\n")
          },
          {
            role: "user",
            content: [
              "From these failure cases, extract concrete correction rules.",
              "Return JSON with keys: general, concept, audit, historical.",
              "Each key should map to an array of short imperative strings.",
              "",
              JSON.stringify(failures.slice(0, 12), null, 2)
            ].join("\n")
          }
        ]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`playbook failed: ${response.status} ${await response.text()}`);
  }

  return parseJsonObject(extractMessageText(await response.json()));
}

async function main() {
  const config = resolveOptimizerModelConfig();
  if (!config.apiKey || !config.baseURL) {
    throw new Error("Missing model config for optimizer.");
  }

  await mkdir(scope.logsDir, { recursive: true });
  const pool = [...buildPromptPool(), ...(await loadCustomPromptPool())];
  const results = [];
  const failures = [];
  let nextIndex = 0;
  const startedAt = new Date().toISOString();
  let playbookError = null;

  async function writeProgress(done = false) {
    const successful = results.filter((item) => !item.error);
    const timeouts = results.filter((item) =>
      /aborted|timeout|timed out|headers timeout/i.test(String(item.error || ""))
    );
    const average =
      results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1);
    const successfulAverage =
      successful.reduce((sum, item) => sum + item.score, 0) / Math.max(successful.length, 1);
    const payload = {
      startedAt,
      updatedAt: new Date().toISOString(),
      done,
      targetScore,
      iterationsTarget: iterations,
      completed: results.length,
      successCount: successful.length,
      timeoutCount: timeouts.length,
      failures: failures.length,
      averageScore: Number(average.toFixed(2)),
      successfulAverageScore: Number(successfulAverage.toFixed(2)),
      lastFailure: failures.length ? failures[failures.length - 1] : null,
      playbookError
    };
    await writeJsonFileAtomic(progressPath, payload);
  }

  async function worker() {
    while (true) {
      const current = nextIndex;
      if (current >= iterations) return;
      nextIndex += 1;
      const item = pool[current % pool.length];
      let output = null;
      let score = 0;

      try {
        output = await requestSalon(item.prompt);
        score = scoreResult(output);
      } catch (error) {
        output = {
          reply: "",
          qualityJudge: {
            overall: 0,
            formal_logic: 0,
            concept_precision: 0,
            argumentative_force: 0
          },
          strictLogicJudge: {
            formal_logic: 0,
            premise_visibility: 0,
            step_validity: 0,
            no_large_leaps: 0,
            passed_strict: false
          },
          historiographyJudge: {
            overall: 0,
            chronology_discipline: 0,
            source_status_honesty: 0,
            analogy_limit: 0,
            passed_strict: false
          },
          error: error instanceof Error ? error.message : String(error)
        };
        score = 0;
      }

      const record = {
        kind: item.kind,
        prompt: item.prompt,
        reply: normalizeWhitespace(output.reply || ""),
        score,
        error: output.error || null,
        qualityJudge: output.qualityJudge || null,
        strictLogicJudge: output.strictLogicJudge || null,
        historiographyJudge: output.historiographyJudge || null
      };
      results.push(record);
      if (score < targetScore) {
        failures.push(record);
      }

      await writeProgress(false);
    }
  }

  await writeProgress(false);
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));

  const average =
    results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1);
  let playbook = null;
  try {
    playbook = await synthesizePlaybook(config, failures);
  } catch (error) {
    playbookError = error instanceof Error ? error.message : String(error);
    playbook = buildFallbackPlaybook(failures);
  }
  await writeOptimizerPlaybook(
    {
      ...playbook,
      userId: userId || null,
      styleProfileId: styleProfileId || null
    }
  );
  const distilledStyleSummary = buildDistilledStyleSummaryFromPlaybook(playbook);
  if (userId && styleProfileId && distilledStyleSummary) {
    updateStyleProfileById(userId, styleProfileId, {
      trainedStyleSummary: distilledStyleSummary,
      updatedAt: new Date().toISOString()
    });
  }
  await writeProgress(true);

  console.log(
    JSON.stringify(
      {
        iterations: results.length,
        targetScore,
        averageScore: Number(average.toFixed(2)),
        failures: failures.length,
        playbook,
        distilledStyleSummary
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
