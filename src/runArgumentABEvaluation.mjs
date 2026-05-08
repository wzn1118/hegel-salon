import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCodexOpenAIConfig } from "./codexConfig.mjs";
import { projectRoot, researchDir } from "./projectPaths.mjs";
import { buildHegelSystemPrompt } from "./hegelPrompt.mjs";
import { buildCorpusContext } from "./hegelContext.mjs";
import {
  aggregateJudgeFlags,
  averageJudgeFields,
  extractJsonObject,
  formatPercent,
  judgeFlagFields,
  judgeNumericFields,
  normalizeJudgeRecord,
  weightedJudgeScore
} from "./argumentEvalMetrics.mjs";
import {
  stripInvalidDirectQuotes,
  validateReplyQuotes
} from "./hegelQuoteValidation.mjs";

const root = projectRoot;
const logsPath = join(root, "data", "logs", "chat-history.jsonl");
const judgeModel = process.env.HEGEL_EVAL_MODEL || "gpt-5.3-codex";
const answerModel = process.env.HEGEL_AB_MODEL || "gpt-5.4";
const concurrency =
  Number.parseInt(process.env.HEGEL_AB_CONCURRENCY || "2", 10) || 2;
const promptSource = process.env.HEGEL_AB_SOURCE || "hybrid";
const logSampleSize =
  Number.parseInt(process.env.HEGEL_AB_LOG_SAMPLE || "16", 10) || 16;
const retryFrom = process.env.HEGEL_AB_RETRY_FROM || "";

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

function buildChatCompletionMessages(systemPrompt, prompt) {
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];
}

function sanitizeReply(text) {
  return normalizeWhitespace(
    String(text || "")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .replace(/I am (an )?(AI|assistant|language model|model|software)[^.\n]*[.\n]?/gi, "")
  );
}

function makeConceptPrompts() {
  const families = [
    {
      topic: "法哲学原理中的自由",
      concept: "自由",
      work: "法哲学原理",
      relationA: "意志",
      relationB: "法",
      relationC: "伦理生活",
      contrast: "任性",
      mediation: "客观世界",
      immediate: "主观感觉",
      actuality: "现实性"
    },
    {
      topic: "法哲学原理中的意志",
      concept: "意志",
      work: "法哲学原理",
      relationA: "自由",
      relationB: "对象",
      relationC: "思维",
      contrast: "欲望",
      mediation: "对象化",
      immediate: "冲动",
      actuality: "现实意志"
    },
    {
      topic: "法哲学原理中的任性",
      concept: "任性",
      work: "法哲学原理",
      relationA: "自由",
      relationB: "意志",
      relationC: "冲动",
      contrast: "思维着的意志",
      mediation: "尺度",
      immediate: "任意选择",
      actuality: "偶然决断"
    },
    {
      topic: "小逻辑中的概念",
      concept: "概念",
      work: "小逻辑",
      relationA: "内容",
      relationB: "发展",
      relationC: "主体",
      contrast: "空形式",
      mediation: "规定自身",
      immediate: "抽象共相",
      actuality: "具体普遍"
    },
    {
      topic: "精神现象学中的精神",
      concept: "精神",
      work: "精神现象学",
      relationA: "主体",
      relationB: "自由",
      relationC: "实存",
      contrast: "静止实体",
      mediation: "对象化与返回",
      immediate: "自然意识",
      actuality: "自知的精神"
    },
    {
      topic: "法哲学原理中的对象",
      concept: "对象",
      work: "法哲学原理",
      relationA: "意志",
      relationB: "自由",
      relationC: "客观性",
      contrast: "单纯外物",
      mediation: "对象性",
      immediate: "外在东西",
      actuality: "意志的现实化"
    },
    {
      topic: "精神现象学中的实体",
      concept: "实体",
      work: "精神现象学",
      relationA: "主体",
      relationB: "概念",
      relationC: "精神",
      contrast: "死的基体",
      mediation: "中介",
      immediate: "固定本体",
      actuality: "自我运动的实体"
    },
    {
      topic: "精神现象学中的主体",
      concept: "主体",
      work: "精神现象学",
      relationA: "实体",
      relationB: "概念",
      relationC: "精神",
      contrast: "经验自我",
      mediation: "自我运动",
      immediate: "心理个体",
      actuality: "通过中介成立的主体"
    },
    {
      topic: "法哲学原理中的伦理生活",
      concept: "伦理生活",
      work: "法哲学原理",
      relationA: "自由",
      relationB: "法",
      relationC: "制度",
      contrast: "私人善意",
      mediation: "制度与习俗",
      immediate: "主观德性",
      actuality: "实现了的自由"
    },
    {
      topic: "法哲学原理中的法与权利",
      concept: "法与权利",
      work: "法哲学原理",
      relationA: "自由",
      relationB: "人格",
      relationC: "客观性",
      contrast: "外在束缚",
      mediation: "人格",
      immediate: "命令",
      actuality: "自由的现实化"
    }
  ];

  const templates = [
    ({ concept, work }) => `${concept}是什么？请用《${work}》的中文原句论证。`,
    ({ concept, work, immediate }) => `请说明《${work}》里${concept}为什么不是${immediate}。`,
    ({ concept, work, relationA }) => `请解释《${work}》里${concept}与${relationA}的关系。`,
    ({ concept, work, relationB }) => `请说明《${work}》里${concept}为什么必须通过${relationB}来理解。`,
    ({ concept, work }) => `请把《${work}》里${concept}的概念讲清楚，不要只给结论。`,
    ({ concept, work, actuality }) => `请用《${work}》说明${concept}怎样获得${actuality}。`,
    ({ concept, work, contrast }) => `请解释《${work}》里${concept}为什么不能停留在${contrast}的层次。`,
    ({ concept, work, mediation }) => `请用中文原句为主，说明《${work}》里${concept}如何通过${mediation}成立。`,
    ({ concept, work, relationC }) => `请说明《${work}》里${concept}与${relationC}为何互相规定。`,
    ({ concept, work }) => `请把《${work}》里${concept}的内在矛盾讲清楚，但不要制造假两难。`,
    ({ concept, work, relationA }) => `请说明《${work}》里${concept}为什么要求${relationA}的普遍性。`,
    ({ concept, work, actuality }) => `请用《${work}》说明${concept}如何从抽象走向${actuality}。`,
    ({ concept, work, immediate }) => `请解释《${work}》里${concept}为什么不能只理解为${immediate}。`,
    ({ concept, work, relationB }) => `请说明《${work}》里${concept}何以具有${relationB}的客观性。`,
    ({ concept, work, contrast }) => `请把《${work}》里${concept}与${contrast}的差别讲清楚。`,
    ({ concept, work }) => `请说明《${work}》里${concept}的规定为什么比常识理解更强。`,
    ({ concept, work }) => `请用《${work}》论证${concept}为什么不是外在附加物。`,
    ({ concept, work, relationB }) => `请解释《${work}》里${concept}如何决定其${relationB}。`,
    ({ concept, work, immediate }) => `请说明《${work}》里${concept}为何不能由${immediate}式的例子替代。`,
    ({ concept, work }) => `请以第一人称重建《${work}》里${concept}的论证链条。`
  ];

  return families.flatMap((family, familyIndex) =>
    templates.map((template, templateIndex) => ({
      id: `concept-${familyIndex + 1}-${templateIndex + 1}`,
      kind: "concept",
      topic: family.topic,
      prompt: template(family)
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
    },
    {
      topic: "思维着的意志",
      text:
        "任性自由虽然贫乏，但它毕竟还是自由；既然它是自由，那么真正自由只不过是把这种选择能力扩大、稳定和制度化。"
    },
    {
      topic: "制度现实性",
      text:
        "只要自由进入制度，它就自动变成真的自由，因为制度本身就是现实性，现实的东西因此必然合理。"
    },
    {
      topic: "版本忠实",
      text:
        "既然不同中译本都在谈同一个德文原文，所以译名差异并不重要，回答时把各种版本的措辞混在一起也没有问题。"
    },
    {
      topic: "引文与解释",
      text:
        "只要一句话大意符合黑格尔，就可以放进引号。引文的作用只是证明方向对，不必严格区分原句、解释和我的推论。"
    }
  ];

  return passages.map((item, index) => ({
    id: `audit-${index + 1}`,
    kind: "audit",
    topic: item.topic,
    prompt: [
      "请按以下要求修订这段文字。",
      "第一，检查论证的形式逻辑是否清楚。请判断每一步是否真的能从前一步推出，哪里存在隐含前提、概念跳跃、偷换概念、循环论证或论证力度不足。",
      "第二，特别检查以下链条是否说清楚：从“任性自由/选择自由的贫乏”到“真正自由必须是思维着的意志”，再到“自由必须在法、制度与伦理生活中取得现实性”。凡是跳步过大的地方，请直接补出前提，但不要无端扩写。",
      "第三，严格区分三件事：哪些是已经核对过的引文，哪些是基于文本的解释，哪些是你自己的推论。绝对不要伪造引文，绝对不要把未经核对的句子放进引号。",
      "第四，保留黑格尔术语的学术密度，但把句子压紧，让论证更锋利。删除重复表述、空转句和装饰性语言。",
      "第五，输出时请给我两个部分。A版：直接给出修订后的完整文本。B版：单独列出你做的关键逻辑修复。",
      `待修订文本：${item.text}`
    ].join("\n")
  }));
}

async function buildLogPromptSet() {
  if (promptSource === "curated" || logSampleSize <= 0) {
    return [];
  }

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

async function makePromptSet() {
  const curated = [...makeConceptPrompts(), ...makeAuditPrompts()];
  if (retryFrom) {
    return loadRetryPromptSet();
  }
  if (promptSource === "curated") {
    return curated;
  }

  const logs = await buildLogPromptSet();
  if (promptSource === "logs") {
    return logs;
  }

  const seen = new Set();
  return [...curated, ...logs].filter((item) => {
    const key = normalizeWhitespace(item.prompt);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function loadRetryPromptSet() {
  const raw = JSON.parse(await readFile(retryFrom, "utf8"));
  return (raw.results || [])
    .filter((item) => item.error)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      topic: item.topic,
      prompt: item.prompt
    }));
}

function isArgumentAuditRequest(prompt) {
  return /形式逻辑|隐含前提|概念跳跃|偷换概念|循环论证|论证力度|A版|B版|修订后的完整文本|关键逻辑修复/u.test(
    String(prompt || "")
  );
}

function requiresChinesePrimaryQuote(prompt, corpusContext) {
  return (
    Boolean(corpusContext?.queryProfile?.preferChinesePrimary) &&
    /原句|原文|引用|引文|逐字|中文/u.test(String(prompt || ""))
  );
}

function hasValidChineseQuote(validation) {
  return (validation?.validQuotedSegments || []).some((segment) =>
    /[\u4e00-\u9fff]/u.test(String(segment || ""))
  );
}

function hasValidLatinQuote(validation) {
  return (validation?.validQuotedSegments || []).some((segment) =>
    /[A-Za-z\u00c0-\u024f]/.test(String(segment || ""))
  );
}

function variantInstruction(name) {
  if (name === "A") {
    return [
      "Use the same behavior as the current production salon.",
      "Keep the answer analytically serious rather than atmospheric."
    ].join("\n");
  }

  return [
    "This variant is optimized for formal logical clarity without sacrificing textual accuracy.",
    "Do not manufacture a false dilemma or a staged first-negation-then-affirm scaffold.",
    "If the text already supplies a positive determination, begin there.",
    "Only draw a conclusion after its premise has appeared explicitly in the answer or in a checked quotation.",
    "If a premise is missing, either add it openly or weaken the conclusion instead of forcing the inference.",
    "Keep checked quotation, textual interpretation, and your own inference visibly distinct in substance.",
    "Prefer one or two decisive checked quotations over many small fragments.",
    "Never quote a stitched phrase, an isolated keyword, or an unchecked sentence.",
    "Do not narrate corpus-grade metadata, validator status, or internal workflow labels unless the user explicitly asks.",
    "Introduce an objection only when the user asks for it or when the passage itself requires that move.",
    "For audit requests, output exactly two plain-text parts: A版 and B版.",
    "A版 must contain the revised full text only.",
    "B版 must contain only the key logical repairs, with no bullet points and no decorative framing.",
    "Compress repetition, but do not cut away premises that are needed for the argument to stand."
  ].join("\n");
}

async function requestCompletion(config, messages, attempt = 1) {
  const response = await fetch(toApiUrl(config.baseURL, "chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      model: answerModel,
      temperature: 0,
      messages
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    if (attempt >= 3) {
      throw new Error(`Completion failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return requestCompletion(config, messages, attempt + 1);
  }

  return sanitizeReply(extractMessageText(await response.json()));
}

async function answerWithVariant(config, variantName, prompt) {
  const basePrompt = buildHegelSystemPrompt();
  const corpusContext = await buildCorpusContext(prompt);
  const multilingualRequested = /中英德|三语|German|English|德文|英文/i.test(prompt);
  const mustUseChineseQuote = requiresChinesePrimaryQuote(prompt, corpusContext);
  const argumentAuditMode = isArgumentAuditRequest(prompt);
  const mustPreferChineseQuotes =
    !multilingualRequested && Boolean(corpusContext?.queryProfile?.preferChinesePrimary);

  const augmentedSystemPrompt = [
    basePrompt,
    "",
    variantInstruction(variantName),
    "",
    "You must treat the following retrieved corpus evidence as mandatory working material for this answer whenever it is relevant.",
    "Only wording that appears literally in the retrieved corpus evidence or in the aligned citation bank may be used as quotation wording.",
    "If the pack supports only the doctrine and not the exact phrase, present the point as interpretation or summary rather than as quotation.",
    corpusContext?.queryProfile?.preferChinesePrimary
      ? "For this query, checked Chinese wording is the primary wording layer."
      : "Use the strongest retrieved wording layer honestly.",
    corpusContext?.chinese?.primaryEdition?.editionLabel
      ? `Current Chinese edition line: ${corpusContext.chinese.primaryEdition.editionLabel}.`
      : "No single checked Chinese edition line has been selected yet for this answer.",
    argumentAuditMode
      ? "This is an argument-audit or revision request."
      : "This is a direct conceptual answer request.",
    "",
    corpusContext.contextText
  ].join("\n");

  let messages = buildChatCompletionMessages(augmentedSystemPrompt, prompt);
  let reply = "";
  let validation = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    reply = await requestCompletion(config, messages);
    validation = validateReplyQuotes(reply, corpusContext);

    const chineseQuoteSatisfied = !mustUseChineseQuote || hasValidChineseQuote(validation);
    const quotePrioritySatisfied =
      !mustPreferChineseQuotes ||
      !hasValidChineseQuote(validation) ||
      !hasValidLatinQuote(validation);

    if (validation.passed && chineseQuoteSatisfied && quotePrioritySatisfied) {
      return { reply, validation, attempts: attempt };
    }

    if (attempt >= 3) {
      break;
    }

    const lines = ["Revise the previous answer."];
    if (validation.invalidQuotedSegments.length) {
      lines.push(
        "Replace any unchecked quotation with either exact checked wording or unquoted interpretation."
      );
    }
    if (mustUseChineseQuote && !hasValidChineseQuote(validation)) {
      lines.push("This answer must include at least one exact checked Chinese quotation.");
    }
    if (mustPreferChineseQuotes && hasValidChineseQuote(validation) && hasValidLatinQuote(validation)) {
      lines.push("Direct quotations should be Chinese rather than English in this query.");
    }

    messages = [
      ...messages,
      { role: "assistant", content: reply },
      { role: "user", content: lines.join("\n") }
    ];
  }

  return {
    reply: stripInvalidDirectQuotes(reply, validation?.invalidQuotedSegments || []),
    validation,
    attempts: 3
  };
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

async function judgeAnswer(config, item, variantName, reply, validation, attempt = 1) {
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
            "You are a strict JSON-only evaluator for formal logic, inferential jumps, quote discipline, and answer quality.",
            "Use decimal scores with one decimal place.",
            "Score narrowly: 10.0 means exceptionally strong, 8.0 means clearly good, 6.0 means mixed, 4.0 means weak, 2.0 means seriously defective."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `Variant: ${variantName}`,
            "请按以下标准评估这个回答，并打分。",
            "第一，检查论证的形式逻辑是否清楚。请判断每一步是否真的能从前一步推出，哪里存在隐含前提、概念跳跃、偷换概念、循环论证或论证力度不足。",
            "第二，特别检查链条是否说清楚，凡是跳步过大的地方，请指出并要求补出前提。",
            "第三，严格区分三件事：哪些是已经核对过的引文，哪些是基于文本的解释，哪些是回答者自己的推论。",
            "第四，检查句子是否压紧，是否存在重复表述、空转句和装饰性语言。",
            "请用更细粒度的分项打分。所有数字都用 0.0 到 10.0 的一位小数。",
            "输出 JSON：",
            "{",
            ...buildJudgeSchemaLines(),
            "}",
            "",
            JSON.stringify(
              {
                id: item.id,
                kind: item.kind,
                prompt: item.prompt,
                reply,
                validation
              },
              null,
              2
            )
          ].join("\n")
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    if (attempt >= 3) {
      throw new Error(`Judge failed (${response.status}): ${detail.slice(0, 400)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return judgeAnswer(config, item, variantName, reply, validation, attempt + 1);
  }

  const raw = extractMessageText(await response.json()).trim();

  try {
    return normalizeJudgeRecord(JSON.parse(extractJsonObject(raw)));
  } catch {
    if (attempt >= 3) {
      throw new Error(`Judge JSON parse failed: ${raw.slice(0, 400)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return judgeAnswer(config, item, variantName, reply, validation, attempt + 1);
  }
}

function normalizePairJudgeRecord(record) {
  return {
    A: normalizeJudgeRecord(record?.A || {}),
    B: normalizeJudgeRecord(record?.B || {}),
    comparisonSummary:
      typeof record?.comparisonSummary === "string" ? record.comparisonSummary.trim() : "",
    comparisonIssues: Array.isArray(record?.comparisonIssues)
      ? record.comparisonIssues
          .filter((item) => typeof item === "string" && item.trim())
          .slice(0, 6)
      : []
  };
}

async function judgePair(config, item, variantA, variantB, attempt = 1) {
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
            "You are a strict JSON-only pairwise evaluator for formal logic, inferential jumps, quote discipline, and answer quality.",
            "Score both variants with decimal scores using one decimal place.",
            "Do not reward mere verbosity or atmosphere. Reward explicit premises, clean inferential steps, quotation honesty, textual grounding, and compressed prose."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            "请对 A、B 两个回答分别打分，再给出简短比较。",
            "标准仍然是：形式逻辑、隐含前提是否补足、是否有大跳步、是否准确回答问题、是否严格区分已核引文/文本解释/自己的推论、以及文字是否压紧。",
            "所有数字都用 0.0 到 10.0 的一位小数。",
            "输出 JSON：",
            "{",
            '  "A": {',
            ...buildJudgeSchemaLines(),
            "  },",
            '  "B": {',
            ...buildJudgeSchemaLines(),
            "  },",
            '  "comparisonSummary": "一句话比较",',
            '  "comparisonIssues": ["最多六条，简短"]',
            "}",
            "",
            JSON.stringify(
              {
                id: item.id,
                kind: item.kind,
                prompt: item.prompt,
                A: {
                  reply: variantA.reply,
                  validation: variantA.validation,
                  attempts: variantA.attempts
                },
                B: {
                  reply: variantB.reply,
                  validation: variantB.validation,
                  attempts: variantB.attempts
                }
              },
              null,
              2
            )
          ].join("\n")
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    if (attempt >= 3) {
      throw new Error(`Pair judge failed (${response.status}): ${detail.slice(0, 400)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return judgePair(config, item, variantA, variantB, attempt + 1);
  }

  const raw = extractMessageText(await response.json()).trim();

  try {
    return normalizePairJudgeRecord(JSON.parse(extractJsonObject(raw)));
  } catch {
    if (attempt >= 3) {
      throw new Error(`Pair judge JSON parse failed: ${raw.slice(0, 400)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return judgePair(config, item, variantA, variantB, attempt + 1);
  }
}

function winnerFromJudges(a, b) {
  const aOverall = Number(a?.overall || 0);
  const bOverall = Number(b?.overall || 0);
  if (Math.abs(aOverall - bOverall) >= 0.25) {
    return aOverall > bOverall ? "A" : "B";
  }

  const aTie = weightedJudgeScore(a);
  const bTie = weightedJudgeScore(b);

  if (Math.abs(aTie - bTie) < 1) {
    return "tie";
  }

  return aTie > bTie ? "A" : "B";
}

async function runItem(config, item) {
  const [a, b] = await Promise.all([
    answerWithVariant(config, "A", item.prompt),
    answerWithVariant(config, "B", item.prompt)
  ]);
  const pairJudge = await judgePair(config, item, a, b);
  const judgeA = pairJudge.A;
  const judgeB = pairJudge.B;

  return {
    ...item,
    A: { ...a, judge: judgeA },
    B: { ...b, judge: judgeB },
    pairJudge,
    winner: winnerFromJudges(judgeA, judgeB)
  };
}

function aggregate(results, key) {
  return averageJudgeFields(results.map((item) => item[key]?.judge).filter(Boolean));
}

function aggregateFlags(results, key) {
  return aggregateJudgeFlags(results.map((item) => item[key]?.judge).filter(Boolean));
}

function averageDelta(results, field) {
  return (
    results.reduce(
      (sum, item) => sum + Number(item.B?.judge?.[field] || 0) - Number(item.A?.judge?.[field] || 0),
      0
    ) / Math.max(results.length, 1)
  ).toFixed(2);
}

function renderMetricLines(metrics) {
  return judgeNumericFields.map((field) => `- ${field}: ${metrics[field]}`);
}

function renderFlagLines(flags) {
  return judgeFlagFields.map((field) => `- ${field}: ${formatPercent(flags[field])}`);
}

function buildKindBreakdown(results, key) {
  const kinds = [...new Set(results.map((item) => item.kind).filter(Boolean))];
  const lines = [];

  for (const kind of kinds) {
    const subset = results.filter((item) => item.kind === kind);
    lines.push(`### ${key} / ${kind}`);
    lines.push("");
    lines.push(...renderMetricLines(aggregate(subset, key)));
    lines.push("");
    lines.push(...renderFlagLines(aggregateFlags(subset, key)));
    lines.push("");
  }

  return lines;
}

function buildWinnerByKind(results) {
  const kinds = [...new Set(results.map((item) => item.kind).filter(Boolean))];
  const lines = [];

  for (const kind of kinds) {
    const wins = results
      .filter((item) => item.kind === kind)
      .reduce(
        (acc, item) => {
          acc[item.winner] = (acc[item.winner] || 0) + 1;
          return acc;
        },
        { A: 0, B: 0, tie: 0 }
      );
    lines.push(`- ${kind}: A=${wins.A} B=${wins.B} tie=${wins.tie}`);
  }

  return lines;
}

function buildReport(results, failures) {
  const validResults = results.filter((item) => item.A?.judge && item.B?.judge);
  const aggregateA = aggregate(validResults, "A");
  const aggregateB = aggregate(validResults, "B");
  const flagsA = aggregateFlags(validResults, "A");
  const flagsB = aggregateFlags(validResults, "B");
  const wins = validResults.reduce(
    (acc, item) => {
      acc[item.winner] = (acc[item.winner] || 0) + 1;
      return acc;
    },
    { A: 0, B: 0, tie: 0 }
  );
  const deltas = Object.fromEntries(
    judgeNumericFields.map((field) => [field, averageDelta(validResults, field)])
  );
  const byWeightedDelta = [...validResults].sort(
    (left, right) =>
      weightedJudgeScore(right.B?.judge) -
      weightedJudgeScore(right.A?.judge) -
      (weightedJudgeScore(left.B?.judge) - weightedJudgeScore(left.A?.judge))
  );
  const byAbsoluteDelta = [...validResults].sort(
    (left, right) =>
      Math.abs(weightedJudgeScore(left.B?.judge) - weightedJudgeScore(left.A?.judge)) -
      Math.abs(weightedJudgeScore(right.B?.judge) - weightedJudgeScore(right.A?.judge))
  );
  const kindCounts = validResults.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, {});

  const lines = [
    "# Hegel Argument A/B Report",
    "",
    `Date: ${new Date().toISOString()}`,
    `Sample size: ${validResults.length}`,
    `Prompt source: ${promptSource}`,
    `Answer model: ${answerModel}`,
    `Judge model: ${judgeModel}`,
    "",
    "## Sample Breakdown",
    "",
    ...Object.entries(kindCounts).map(([kind, count]) => `- ${kind}: ${count}`),
    "",
    "## Aggregate A",
    "",
    ...renderMetricLines(aggregateA),
    "",
    "## Aggregate B",
    "",
    ...renderMetricLines(aggregateB),
    "",
    "## Aggregate Delta (B - A)",
    "",
    ...renderMetricLines(deltas),
    "",
    "## Flag Rates A",
    "",
    ...renderFlagLines(flagsA),
    "",
    "## Flag Rates B",
    "",
    ...renderFlagLines(flagsB),
    "",
    "## Winners",
    "",
    `- A: ${wins.A}`,
    `- B: ${wins.B}`,
    `- tie: ${wins.tie}`,
    "",
    "## Winners By Kind",
    "",
    ...buildWinnerByKind(validResults),
    "",
    "## By Kind / A",
    "",
    ...buildKindBreakdown(validResults, "A"),
    "## By Kind / B",
    "",
    ...buildKindBreakdown(validResults, "B"),
    "## Largest B Gains",
    ""
  ];

  for (const item of byWeightedDelta.slice(0, 10)) {
    lines.push(
      `- ${item.id} winner=${item.winner} A=${item.A?.judge?.overall ?? "?"} B=${item.B?.judge?.overall ?? "?"} weighted_delta=${(weightedJudgeScore(item.B?.judge) - weightedJudgeScore(item.A?.judge)).toFixed(2)} prompt: ${item.prompt}`
    );
  }

  lines.push("");
  lines.push("## Largest A Gains");
  lines.push("");

  for (const item of byWeightedDelta.slice(-10).reverse()) {
    lines.push(
      `- ${item.id} winner=${item.winner} A=${item.A?.judge?.overall ?? "?"} B=${item.B?.judge?.overall ?? "?"} weighted_delta=${(weightedJudgeScore(item.B?.judge) - weightedJudgeScore(item.A?.judge)).toFixed(2)} prompt: ${item.prompt}`
    );
  }

  lines.push("");
  lines.push("## Near Ties");
  lines.push("");

  for (const item of byAbsoluteDelta.slice(0, 10)) {
    lines.push(
      `- ${item.id} winner=${item.winner} A=${item.A?.judge?.overall ?? "?"} B=${item.B?.judge?.overall ?? "?"} weighted_delta=${(weightedJudgeScore(item.B?.judge) - weightedJudgeScore(item.A?.judge)).toFixed(2)} prompt: ${item.prompt}`
    );
  }

  if (failures.length) {
    lines.push("");
    lines.push("## Failures");
    lines.push("");
    for (const item of failures) {
      lines.push(`- ${item.id} ${item.kind} error: ${item.error}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const config = loadCodexOpenAIConfig();
  if (!config.apiKey || !config.baseURL) {
    throw new Error("Missing Codex/OpenAI configuration.");
  }

  const prompts = await makePromptSet();
  const queue = [...prompts];
  const results = [];
  const failures = [];

  await mkdir(researchDir, { recursive: true });
  console.log(`Running ${prompts.length} A/B prompts...`);

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      try {
        const result = await runItem(config, item);
        results.push(result);
        console.log(
          `${item.id} winner=${result.winner} A=${result.A.judge.overall} B=${result.B.judge.overall}`
        );
      } catch (error) {
        const failure = {
          ...item,
          error: error instanceof Error ? error.message : String(error)
        };
        results.push(failure);
        failures.push(failure);
        console.error(`${item.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  results.sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(researchDir, `hegel-argument-ab-${stamp}.json`);
  const mdPath = join(researchDir, `hegel-argument-ab-${stamp}.md`);

  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        answerModel,
        judgeModel,
        promptSource,
        sampleSize: prompts.length,
        failures,
        results
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(mdPath, buildReport(results, failures), "utf8");

  console.log(`Saved JSON report to ${jsonPath}`);
  console.log(`Saved Markdown report to ${mdPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
