import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCodexOpenAIConfig } from "./codexConfig.mjs";
import { projectRoot, researchDir } from "./projectPaths.mjs";
import {
  aggregateJudgeFlags,
  averageJudgeFields,
  extractJsonObject,
  formatPercent,
  judgeFlagFields,
  judgeNumericFields,
  normalizeJudgeRecord
} from "./argumentEvalMetrics.mjs";

const root = projectRoot;
const logsPath = join(root, "data", "logs", "chat-history.jsonl");
const apiUrl = String(process.env.HEGEL_API_URL || "").trim();
if (!apiUrl) {
  console.error("Set HEGEL_API_URL to the chat endpoint before running the evaluation.");
  process.exit(1);
}
const judgeModel = process.env.HEGEL_EVAL_MODEL || "gpt-5.3-codex";
const concurrency =
  Number.parseInt(process.env.HEGEL_EVAL_CONCURRENCY || "3", 10) || 3;
const retryFrom = process.env.HEGEL_EVAL_RETRY_FROM || "";
const evalSource = process.env.HEGEL_EVAL_SOURCE || "curated";
const logSampleSize =
  Number.parseInt(process.env.HEGEL_EVAL_LOG_SAMPLE || "24", 10) || 24;

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toApiUrl(baseURL, path) {
  return new URL(path, `${String(baseURL).replace(/\/+$/, "")}/`).toString();
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

function makeConceptPrompts() {
  const scenarios = [
    {
      topic: "法哲学原理中的自由",
      prompts: [
        "自由是什么？请用《法哲学原理》的中文原句论证。",
        "请用《法哲学原理》的中文原句说明自由为什么不是空洞的主观感觉。",
        "请把《法哲学原理》里自由的概念讲清楚，不要自动引入任性这个问题。",
        "请说明《法哲学原理》里自由与法的关系，先给出你的观点，再论证。",
        "请解释《法哲学原理》里自由为什么必须进入客观世界，但不要跳步。"
      ]
    },
    {
      topic: "法哲学原理中的意志",
      prompts: [
        "意志是什么？请用《法哲学原理》的中文原句论证。",
        "请说明《法哲学原理》里意志为什么不只是欲望。",
        "请解释《法哲学原理》里意志的结构，不要只下定义。",
        "请说明《法哲学原理》里意志为什么必须通过思维来理解。",
        "请用《法哲学原理》说明意志怎样从抽象形式走向现实。"
      ]
    },
    {
      topic: "法哲学原理中的对象",
      prompts: [
        "《法哲学原理》里的对象是什么？请用中文原句论证。",
        "请说明《法哲学原理》里意志为什么要把自身当作对象。",
        "请解释《法哲学原理》里对象为什么不是单纯外物。",
        "请说明《法哲学原理》里对象性与自由有什么关系。",
        "请用《法哲学原理》论证对象为什么是意志现实化的环节。"
      ]
    },
    {
      topic: "法哲学原理中的法与权利",
      prompts: [
        "《法哲学原理》里法与权利是什么关系？请用中文原句论证。",
        "请说明《法哲学原理》里法为什么不是自由之外的束缚。",
        "请解释《法哲学原理》里法的理念为什么以自由为根据。",
        "请说明《法哲学原理》里权利为什么不能只理解为外在限制。",
        "请用《法哲学原理》说明法与自由的概念连接。"
      ]
    },
    {
      topic: "法哲学原理中的伦理生活",
      prompts: [
        "《法哲学原理》里的伦理生活是什么？请用中文原句论证。",
        "请说明《法哲学原理》里伦理生活为什么高于抽象法与道德。",
        "请解释《法哲学原理》里伦理生活如何使自由获得现实性。",
        "请说明《法哲学原理》里伦理生活为何不是私人善意。",
        "请用《法哲学原理》说明伦理生活与普遍性的关系。"
      ]
    },
    {
      topic: "小逻辑中的概念",
      prompts: [
        "《小逻辑》里的概念是什么？请用中文原句论证。",
        "请说明《小逻辑》里概念为什么不是空形式。",
        "请解释《小逻辑》里概念为什么具有内容。",
        "请说明《小逻辑》里概念的运动为什么叫发展。",
        "请用《小逻辑》论证概念怎样在发展中保持自身。"
      ]
    },
    {
      topic: "精神现象学中的精神",
      prompts: [
        "《精神现象学》里的精神是什么？请用中文原句论证。",
        "请说明《精神现象学》里精神为什么不是静止实体。",
        "请解释《精神现象学》里精神如何通过实存而成为精神。",
        "请说明《精神现象学》里精神与伦理生活的关系。",
        "请用《精神现象学》论证精神为什么必须经过对象化和返回。"
      ]
    },
    {
      topic: "精神现象学中的实体与主体",
      prompts: [
        "请用中文原句为主，说明《精神现象学》里实体与主体是什么关系。",
        "请说明《精神现象学》里为什么说实体同样是主体，不要口号化。",
        "请解释《精神现象学》里实体为什么必须显明为主体。",
        "请说明《精神现象学》里主体为什么不是经验自我。",
        "请用《精神现象学》论证实体与主体的统一如何通过中介成立。"
      ]
    }
  ];

  return scenarios.flatMap((scenario, scenarioIndex) =>
    scenario.prompts.map((prompt, promptIndex) => ({
      id: `concept-${scenarioIndex + 1}-${promptIndex + 1}`,
      kind: "concept",
      topic: scenario.topic,
      prompt
    }))
  );
}

function makeAuditPrompts() {
  const passages = [
    {
      topic: "自由与任性",
      text:
        "自由就是想选什么就选什么，因为意志是自由的。所以真正自由就是任性。法之所以重要，只是因为任性最后要靠制度维持。"
    },
    {
      topic: "实体与主体",
      text:
        "实体同样是主体，意思就是绝对者既是实体也是主体。所以主体就是实体，实体就是主体，这已经说明了一切。"
    },
    {
      topic: "概念",
      text:
        "概念不是空形式，因为概念有内容。只要内容被概念把握，概念就不是空的。因此概念一定有内容。"
    },
    {
      topic: "精神",
      text:
        "精神之所以是精神，就是因为它实存着。既然它实存着，它就是精神。所以精神的本质就是实存。"
    },
    {
      topic: "法与自由",
      text:
        "法的理念是自由，所以凡是法都是自由。国家既然是法的现实化，所以国家的一切规定也都是自由。"
    },
    {
      topic: "对象",
      text:
        "只有当意志把自身当作对象时，它才自由。因此对象就是自由。既然对象就是自由，所有对象也都是自由。"
    },
    {
      topic: "伦理生活",
      text:
        "伦理生活高于道德，因为伦理生活更现实。凡是更现实的东西都更高，所以伦理生活一定是真理。"
    },
    {
      topic: "公共批评者",
      text:
        "只要一个人不断否定流行意见，他就已经具有哲学意义。因为否定比肯定更深刻，所以强烈批评本身就是真理。"
    }
  ];

  return passages.map((item, index) => ({
    id: `audit-${index + 1}`,
    kind: "audit",
    topic: item.topic,
    prompt: [
      "请按以下要求修订这段文字。",
      "第一，检查论证的形式逻辑是否清楚，判断每一步是否真的能从前一步推出。",
      "第二，凡是跳步过大的地方，请直接补出前提，但不要无端扩写。",
      "第三，严格区分哪些是已经核对过的引文，哪些是基于文本的解释，哪些是你自己的推论。",
      "第四，保留学术密度，但把句子压紧。",
      "第五，输出时请给我两个部分。A版：修订后的完整文本。B版：关键逻辑修复。",
      `待修订文本：${item.text}`
    ].join("\n")
  }));
}

function buildPromptSet() {
  return [...makeConceptPrompts(), ...makeAuditPrompts()];
}

async function buildLogPromptSet() {
  let raw = "";
  try {
    raw = await readFile(logsPath, "utf8");
  } catch {
    return [];
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const prompts = [];
  const seen = new Set();
  const conceptPattern =
    /为什么|如何|何以|概念|定义|论证|自由|意志|对象|主体|实体|精神|法|权利|伦理|国家|形式逻辑|隐含前提|概念跳跃/u;

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
    if (!prompt || prompt.length < 8 || !conceptPattern.test(prompt) || seen.has(prompt)) {
      continue;
    }

    seen.add(prompt);
    prompts.push({
      id: `log-${prompts.length + 1}`,
      kind: "log",
      topic: "historical-log-prompt",
      prompt
    });

    if (prompts.length >= logSampleSize) {
      break;
    }
  }

  return prompts;
}

async function loadRetryPromptSet() {
  if (!retryFrom) {
    return null;
  }

  const raw = JSON.parse(await readFile(retryFrom, "utf8"));
  return (raw.results || [])
    .filter((item) => item.error || !item.judge)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      topic: item.topic,
      prompt: item.prompt
    }));
}

function buildJudgeSchemaLines() {
  return [
    ...judgeNumericFields.map((field) => `  "${field}": 0.0-10.0,`),
    ...judgeFlagFields.map((field) => `  "${field}": true/false,`),
    '  "summary": "一句话总结",',
    '  "issues": ["最多八条，简短"],',
    '  "strengths": ["最多五条，简短"]'
  ];
}

async function requestJudge(config, payload, attempt = 1) {
  const response = await fetch(toApiUrl(config.baseURL, "chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      model: judgeModel,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "You are Codex acting as a strict evaluator for a Hegel salon.",
            "Judge whether the answer satisfies fine-grained standards of formal logic, inferential discipline, quotation honesty, textual grounding, and prose compression.",
            "Use decimal scores with one decimal place and return JSON only."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            "请按以下标准评估这个回答，并打分。",
            "第一，检查论证的形式逻辑是否清楚。请判断每一步是否真的能从前一步推出，哪里存在隐含前提、概念跳跃、偷换概念、循环论证或论证力度不足。",
            "第二，特别检查链条是否说清楚，凡是跳步过大的地方，请指出并要求补出前提。",
            "第三，严格区分三件事：哪些是已经核对过的引文，哪些是基于文本的解释，哪些是回答者自己的推论。",
            "第四，检查句子是否压紧，是否存在重复表述、空转句和装饰性语言。",
            "请用更细粒度的分项打分。所有数字都用 0.0 到 10.0 的一位小数。",
            "请输出 JSON，字段固定为：",
            "{",
            ...buildJudgeSchemaLines(),
            "}",
            "",
            "评测对象如下：",
            JSON.stringify(payload, null, 2)
          ].join("\n")
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    if (attempt >= 3) {
      throw new Error(`Judge request failed (${response.status}): ${detail.slice(0, 400)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return requestJudge(config, payload, attempt + 1);
  }

  const raw = extractMessageText(await response.json()).trim();

  try {
    return normalizeJudgeRecord(JSON.parse(extractJsonObject(raw)));
  } catch {
    if (attempt >= 3) {
      throw new Error(`Judge JSON parse failed: ${raw.slice(0, 400)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return requestJudge(config, payload, attempt + 1);
  }
}

async function requestSalon(prompt, attempt = 1) {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }]
      })
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || `HTTP ${response.status}`);
    }
    return json;
  } catch (error) {
    if (attempt >= 3) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    return requestSalon(prompt, attempt + 1);
  }
}

function buildMarkdownReport(results) {
  const judged = results.filter((item) => item.judge);
  const total = judged.length;
  const averages = averageJudgeFields(judged.map((item) => item.judge));
  const flags = aggregateJudgeFlags(judged.map((item) => item.judge));
  const low = judged
    .filter((item) => Number(item.judge?.overall || 0) < 7.5)
    .sort((left, right) => Number(left.judge?.overall || 0) - Number(right.judge?.overall || 0));

  const lines = [
    "# Hegel Argument Evaluation Report",
    "",
    `Date: ${new Date().toISOString()}`,
    `Sample size: ${total}`,
    `Judge model: ${judgeModel}`,
    `API under test: ${apiUrl}`,
    "",
    "## Aggregate Scores",
    "",
    ...judgeNumericFields.map((field) => `- ${field}: ${averages[field]}`),
    "",
    "## Flag Rates",
    "",
    ...judgeFlagFields.map((field) => `- ${field}: ${formatPercent(flags[field])}`),
    "",
    "## Lowest Cases",
    ""
  ];

  for (const item of low.slice(0, 12)) {
    lines.push(
      `- ${item.id} ${item.topic} overall=${item.judge?.overall ?? "?"} prompt: ${item.prompt}`
    );
    if (item.judge?.issues?.length) {
      lines.push(`  issues: ${item.judge.issues.join(" | ")}`);
    }
    lines.push(`  summary: ${item.judge?.summary || ""}`);
  }

  return lines.join("\n");
}

async function runWorker(config, queue, results) {
  while (queue.length) {
    const item = queue.shift();
    if (!item) return;

    try {
      const response = await requestSalon(item.prompt);
      const judge = await requestJudge(config, {
        id: item.id,
        topic: item.topic,
        prompt: item.prompt,
        reply: normalizeWhitespace(response.reply),
        validation: response.validation,
        attempts: response.attempts
      });

      results.push({
        ...item,
        reply: response.reply,
        validation: response.validation,
        attempts: response.attempts,
        judge
      });
      console.log(`${item.id} done overall=${judge.overall}`);
    } catch (error) {
      results.push({
        ...item,
        error: error instanceof Error ? error.message : String(error)
      });
      console.error(`${item.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function main() {
  const config = loadCodexOpenAIConfig();

  if (!config.apiKey || !config.baseURL) {
    throw new Error("Missing Codex/OpenAI configuration.");
  }

  const prompts =
    (await loadRetryPromptSet()) ||
    (evalSource === "logs" ? await buildLogPromptSet() : buildPromptSet());
  const queue = [...prompts];
  const results = [];

  await mkdir(researchDir, { recursive: true });
  console.log(`Running ${prompts.length} argument eval prompts with judge model ${judgeModel}...`);

  await Promise.all(
    Array.from({ length: concurrency }, () => runWorker(config, queue, results))
  );

  results.sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(researchDir, `hegel-argument-eval-${stamp}.json`);
  const mdPath = join(researchDir, `hegel-argument-eval-${stamp}.md`);

  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        judgeModel,
        apiUrl,
        sampleSize: prompts.length,
        results
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(mdPath, buildMarkdownReport(results), "utf8");

  console.log(`Saved JSON report to ${jsonPath}`);
  console.log(`Saved Markdown report to ${mdPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
