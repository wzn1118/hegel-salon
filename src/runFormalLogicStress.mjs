import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCodexOpenAIConfig } from "./codexConfig.mjs";
import { projectRoot } from "./projectPaths.mjs";

const root = projectRoot;
const logsPath = join(root, "data", "logs", "chat-history.jsonl");
const apiUrl = String(process.env.HEGEL_API_URL || "").trim();
if (!apiUrl) {
  console.error("Set HEGEL_API_URL to the chat endpoint before running the stress test.");
  process.exit(1);
}
const judgeModel = process.env.HEGEL_EVAL_MODEL || "gpt-5.3-codex";
const iterations =
  Number.parseInt(process.env.HEGEL_FORMAL_STRESS_ITERATIONS || "100000", 10) || 100000;
const concurrency =
  Number.parseInt(process.env.HEGEL_FORMAL_STRESS_CONCURRENCY || "4", 10) || 4;
const sampleFromLogs =
  Number.parseInt(process.env.HEGEL_FORMAL_STRESS_LOG_SAMPLE || "200", 10) || 200;
const failFast = process.env.HEGEL_FORMAL_STRESS_FAIL_FAST !== "0";

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

function extractJsonObject(rawText) {
  const raw = String(rawText || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end >= start ? raw.slice(start, end + 1) : raw;
}

function parseJsonSafe(rawText) {
  try {
    return JSON.parse(extractJsonObject(rawText));
  } catch {
    return {};
  }
}

function buildCuratedPrompts() {
  const conceptPrompts = [
    "自由为什么不是任意选择？请把概念、前提、反对意见与回答都讲清楚。",
    "为什么意志不能等于欲望？请把每一步推出关系讲明。",
    "实体同样是主体这一命题为什么不是同语反复？请给出严格论证。",
    "概念为什么不是空形式？不要跳步。",
    "伦理生活为什么高于抽象法与道德？请明确前提链条。"
  ];

  const auditPrompts = [
    [
      "请按严格形式逻辑修订以下文字。",
      "要求：显性化隐含前提，禁止概念跳跃，禁止循环论证，禁止偷换概念。",
      "文本：自由就是想选什么就选什么，因为意志是自由的。所以真正自由就是任性。"
    ].join("\n"),
    [
      "请按严格形式逻辑修订以下文字。",
      "要求：显性化隐含前提，禁止概念跳跃，禁止循环论证，禁止偷换概念。",
      "文本：实体同样是主体，意思就是绝对者既是实体也是主体。所以主体就是实体，实体就是主体，这已经说明了一切。"
    ].join("\n"),
    [
      "请按严格形式逻辑修订以下文字。",
      "要求：显性化隐含前提，禁止概念跳跃，禁止循环论证，禁止偷换概念。",
      "文本：法的理念是自由，所以凡是法都是自由。国家既然是法的现实化，所以国家的一切规定也都是自由。"
    ].join("\n"),
    [
      "请按严格形式逻辑修订以下文字。",
      "要求：显性化隐含前提，禁止概念跳跃，禁止循环论证，禁止偷换概念。",
      "文本：只要一个人不断否定流行意见，他就已经具有哲学意义。因为否定比肯定更深刻，所以强烈批评本身就是真理。"
    ].join("\n"),
    [
      "请按严格形式逻辑修订以下文字。",
      "要求：显性化隐含前提，禁止概念跳跃，禁止循环论证，禁止偷换概念。",
      "文本：只要自由进入制度，它就自动变成真的自由，因为制度本身就是现实性，现实的东西因此必然合理。"
    ].join("\n")
  ];

  return [...conceptPrompts, ...auditPrompts];
}

async function buildLogPrompts() {
  let raw = "";
  try {
    raw = await readFile(logsPath, "utf8");
  } catch {
    return [];
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const prompts = [];
  const seen = new Set();
  const pattern =
    /形式逻辑|逻辑|隐含前提|概念跳跃|偷换概念|循环论证|论证|反对意见|为什么|如何|何以/u;

  for (const line of lines.reverse()) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const history = Array.isArray(record?.history) ? record.history : [];
    const latestUser = [...history].reverse().find((item) => item?.role === "user");
    const prompt = normalizeWhitespace(latestUser?.content || "");
    if (!prompt || prompt.length < 8 || !pattern.test(prompt) || seen.has(prompt)) {
      continue;
    }

    seen.add(prompt);
    prompts.push(prompt);
    if (prompts.length >= sampleFromLogs) {
      break;
    }
  }

  return prompts;
}

async function requestSalonReply(prompt) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`chat failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function requestJudge(config, prompt, reply) {
  const response = await fetch(
    new URL("chat/completions", `${String(config.baseURL).replace(/\/+$/, "")}/`).toString(),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        model: judgeModel,
        stream: false,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "You are a severe formal-logic evaluator.",
              "Return JSON only.",
              "A single hidden premise, concept jump, equivocation, circularity, or insufficient support counts as failure.",
              "Use 0-10 numeric fields and booleans exactly as requested."
            ].join("\n")
          },
          {
            role: "user",
            content: [
              "Evaluate the following Chinese answer for strict formal logic and anti-fallacy discipline.",
              "If there is any hidden premise, concept jump, equivocation, circularity, or insufficient support, set the corresponding flag to true and set passed_strict to false.",
              "JSON keys:",
              "{",
              '  "formal_logic": 0.0-10.0,',
              '  "premise_visibility": 0.0-10.0,',
              '  "step_validity": 0.0-10.0,',
              '  "concept_stability": 0.0-10.0,',
              '  "no_large_leaps": 0.0-10.0,',
              '  "support_strength": 0.0-10.0,',
              '  "has_hidden_premise": true/false,',
              '  "has_concept_jump": true/false,',
              '  "has_equivocation": true/false,',
              '  "has_circularity": true/false,',
              '  "has_insufficient_support": true/false,',
              '  "passed_strict": true/false,',
              '  "summary": "一句话总结",',
              '  "issues": ["简短问题列表"]',
              "}",
              "",
              "Question:",
              prompt,
              "",
              "Answer:",
              reply
            ].join("\n")
          }
        ]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`judge failed: ${response.status} ${await response.text()}`);
  }

  return parseJsonSafe(extractMessageText(await response.json()));
}

function isStrictPass(judge = {}) {
  return (
    judge.passed_strict === true &&
    judge.has_hidden_premise !== true &&
    judge.has_concept_jump !== true &&
    judge.has_equivocation !== true &&
    judge.has_circularity !== true &&
    judge.has_insufficient_support !== true &&
    Number(judge.formal_logic || 0) >= 9.9 &&
    Number(judge.premise_visibility || 0) >= 9.9 &&
    Number(judge.step_validity || 0) >= 9.9 &&
    Number(judge.concept_stability || 0) >= 9.9 &&
    Number(judge.no_large_leaps || 0) >= 9.9 &&
    Number(judge.support_strength || 0) >= 9.9
  );
}

async function main() {
  const config = loadCodexOpenAIConfig();
  if (!config.apiKey || !config.baseURL) {
    throw new Error("Missing OpenAI/Codex config for stress judge.");
  }

  const promptPool = [...buildCuratedPrompts(), ...(await buildLogPrompts())];
  if (!promptPool.length) {
    throw new Error("No prompts available for formal stress testing.");
  }

  const failures = [];
  let completed = 0;
  let nextIndex = 0;
  const startedAt = Date.now();

  async function worker() {
    while (true) {
      const current = nextIndex;
      if (current >= iterations) {
        return;
      }
      nextIndex += 1;

      const prompt = promptPool[current % promptPool.length];
      const response = await requestSalonReply(prompt);
      const reply = normalizeWhitespace(response?.reply || "");
      const judge = await requestJudge(config, prompt, reply);
      const passed = isStrictPass(judge);

      completed += 1;
      if (!passed) {
        failures.push({
          iteration: current + 1,
          prompt,
          reply,
          judge
        });
        if (failFast) {
          throw new Error(`Strict formal logic failed at iteration ${current + 1}`);
        }
      }

      if (completed % 100 === 0) {
        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
          JSON.stringify({
            completed,
            iterations,
            failures: failures.length,
            elapsedSec
          })
        );
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());

  try {
    await Promise.all(workers);
  } catch (error) {
    console.error(
      JSON.stringify({
        completed,
        iterations,
        failures: failures.length,
        firstFailure: failures[0] || null,
        error: error instanceof Error ? error.message : String(error)
      })
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify({
      completed,
      iterations,
      failures: failures.length,
      strictPass: failures.length === 0
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
