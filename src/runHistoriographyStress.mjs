import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCodexOpenAIConfig } from "./codexConfig.mjs";
import { projectRoot } from "./projectPaths.mjs";

const root = projectRoot;
const logsPath = join(root, "data", "logs", "chat-history.jsonl");
const apiUrl = process.env.HEGEL_API_URL || "http://127.0.0.1:3087/api/chat";
const judgeModel = process.env.HEGEL_EVAL_MODEL || "gpt-5.2";
const iterations =
  Number.parseInt(process.env.HEGEL_HIST_STRESS_ITERATIONS || "100000", 10) || 100000;
const concurrency =
  Number.parseInt(process.env.HEGEL_HIST_STRESS_CONCURRENCY || "3", 10) || 3;
const sampleFromLogs =
  Number.parseInt(process.env.HEGEL_HIST_STRESS_LOG_SAMPLE || "200", 10) || 200;
const failFast = process.env.HEGEL_HIST_STRESS_FAIL_FAST !== "0";

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
  return [
    "如何评价一位强调中心统合的当代大国领导者？必须引用历史来理解现实，明确类比边界，不要停在公共评论。",
    "如何理解一位在民选体制下造成高度极化的当代领袖现象？请用历史形式来分析，而不是做新闻评论。",
    "如何判断当代大国的国家能力？请用法哲学和世界历史线索来理解现实。",
    "如何理解现代代议制政治的撕裂？请给出现实对象、历史形式与类比边界。",
    "如何理解平台资本与公众意见的关系？请用黑格尔历史与制度线索来分析。",
    "如何理解当代地区战争中的国家、帝国与民族问题？请严格区分历史类比的边界。",
    "如何理解现代官僚体系的忠诚逻辑？请用历史引用理解现实。",
    "如何理解当代区域共同体的合法性危机？不要把历史引文当装饰，要给出史学层级。",
    "如何理解中美竞争中的普遍性与国家理性？必须标明历史形式，而不是套现成口号。",
    "如何理解现实政治中的中央集权与纠错难题？请严格区分历史见证和你的推论。 "
  ];
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
    /现实|当代|今天|现代|国家|政治|历史|史学|世界历史|舆论|媒体|资本|战争|帝国|习近平|特朗普|拜登|普京|中国|美国|欧洲/u;

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
    if (!prompt || prompt.length < 10 || !pattern.test(prompt) || seen.has(prompt)) {
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

async function requestHistJudge(config, prompt, reply) {
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
              "You are a severe historiography auditor for reality-oriented Hegelian analysis.",
              "Return JSON only.",
              "Any anachronism, source laundering, unbounded analogy, flattened development, or presentism counts as failure."
            ].join("\n")
          },
          {
            role: "user",
            content: [
              "Audit the following answer under a strict historiographical standard.",
              "JSON keys:",
              "{",
              '  "overall": 0.0-10.0,',
              '  "chronology_discipline": 0.0-10.0,',
              '  "source_status_honesty": 0.0-10.0,',
              '  "authority_weighting": 0.0-10.0,',
              '  "analogy_limit": 0.0-10.0,',
              '  "anachronism_avoidance": 0.0-10.0,',
              '  "development_tracking": 0.0-10.0,',
              '  "institutional_specificity": 0.0-10.0,',
              '  "present_object_clarity": 0.0-10.0,',
              '  "has_anachronism": true/false,',
              '  "has_source_laundering": true/false,',
              '  "has_unbounded_analogy": true/false,',
              '  "has_flattened_development": true/false,',
              '  "has_presentism": true/false,',
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
    judge.has_anachronism !== true &&
    judge.has_source_laundering !== true &&
    judge.has_unbounded_analogy !== true &&
    judge.has_flattened_development !== true &&
    judge.has_presentism !== true &&
    Number(judge.overall || 0) >= 9.9 &&
    Number(judge.chronology_discipline || 0) >= 9.9 &&
    Number(judge.source_status_honesty || 0) >= 9.9 &&
    Number(judge.authority_weighting || 0) >= 9.9 &&
    Number(judge.analogy_limit || 0) >= 9.9 &&
    Number(judge.anachronism_avoidance || 0) >= 9.9 &&
    Number(judge.development_tracking || 0) >= 9.8 &&
    Number(judge.institutional_specificity || 0) >= 9.8 &&
    Number(judge.present_object_clarity || 0) >= 9.8
  );
}

async function main() {
  const config = loadCodexOpenAIConfig();
  if (!config.apiKey || !config.baseURL) {
    throw new Error("Missing OpenAI/Codex config for historiography stress judge.");
  }

  const promptPool = [...buildCuratedPrompts(), ...(await buildLogPrompts())];
  if (!promptPool.length) {
    throw new Error("No prompts available for historiography stress testing.");
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
      const serverJudge = response?.historiographyJudge || null;
      const judge = await requestHistJudge(config, prompt, reply);
      const passed = isStrictPass(judge) && isStrictPass(serverJudge || judge);

      completed += 1;
      if (!passed) {
        failures.push({
          iteration: current + 1,
          prompt,
          reply,
          serverJudge,
          judge
        });
        if (failFast) {
          throw new Error(`Strict historiography failed at iteration ${current + 1}`);
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
