import { existsSync } from "node:fs";
import { mkdir, appendFile, readFile } from "node:fs/promises";
import {
  appendTextFileDurable,
  readJsonFileWithRecovery,
  writeJsonFileAtomic,
  writeTextFileAtomic
} from "./atomicFile.mjs";
import { buildRuntimeScope } from "./runtimeScope.mjs";

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasDogmaticScaffoldPattern(text = "") {
  const content = normalizeWhitespace(text);
  return /不是[^。；\n]{0,42}而是[^。；\n]{0,42}/u.test(content)
    || /问题不在于[^。；\n]{0,42}而在于[^。；\n]{0,42}/u.test(content)
    || /真正的[^。；\n]{0,24}不是[^。；\n]{0,42}而是[^。；\n]{0,42}/u.test(content)
    || /归根到底/u.test(content)
    || /说到底/u.test(content);
}

function sanitizePlaybookRule(text = "") {
  const normalized = normalizeWhitespace(text);
  if (!normalized || hasDogmaticScaffoldPattern(normalized)) {
    return "";
  }
  return normalized;
}

function tokenizePrompt(text) {
  const raw = normalizeWhitespace(text).toLowerCase();
  const tokens = new Set();

  for (const match of raw.matchAll(/[\p{Letter}\p{Number}]{2,}/gu)) {
    tokens.add(match[0]);
  }

  for (const chunk of raw.match(/[\u4e00-\u9fff]{2,}/gu) || []) {
    for (let index = 0; index < chunk.length - 1; index += 1) {
      tokens.add(chunk.slice(index, index + 2));
    }
  }

  return [...tokens];
}

function jaccardSimilarity(leftTokens, rightTokens) {
  const left = new Set(leftTokens || []);
  const right = new Set(rightTokens || []);
  if (!left.size || !right.size) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function classifyPrompt(prompt) {
  const text = String(prompt || "");
  if (/现实|当代|今天|现代|国家|政治|历史|中国|美国|欧洲|领导人|执政者|民选领袖|中心人物/u.test(text)) {
    return "historical";
  }
  if (/形式逻辑|隐含前提|概念跳跃|偷换概念|循环论证|修订/u.test(text)) {
    return "audit";
  }
  return "concept";
}

function extractIssues(record = {}) {
  const issues = [];
  for (const bucket of [
    record?.qualityJudge?.issues,
    record?.strictLogicJudge?.issues,
    record?.historiographyJudge?.issues
  ]) {
    if (!Array.isArray(bucket)) continue;
    for (const issue of bucket) {
      const cleaned = normalizeWhitespace(issue);
      if (cleaned && !issues.includes(cleaned)) {
        issues.push(cleaned);
      }
    }
  }
  return issues.slice(0, 10);
}

function normalizeRecord(record = {}) {
  const prompt = normalizeWhitespace(record.prompt || "");
  return {
    timestamp: record.timestamp || new Date().toISOString(),
    prompt,
    promptClass: record.promptClass || classifyPrompt(prompt),
    promptTokens: Array.isArray(record.promptTokens) ? record.promptTokens : tokenizePrompt(prompt),
    reply: normalizeWhitespace(record.reply || ""),
    qualityJudge: record.qualityJudge || null,
    strictLogicJudge: record.strictLogicJudge || null,
    historiographyJudge: record.historiographyJudge || null,
    selfAudit: record.selfAudit || null,
    issues: Array.isArray(record.issues) ? record.issues : extractIssues(record)
  };
}

export async function appendOptimizerRecord(record) {
  const scope = buildRuntimeScope(record?.userId || null, record?.styleProfileId || null);
  const normalized = normalizeRecord(record);
  await mkdir(scope.logsDir, { recursive: true });
  await appendTextFileDurable(scope.optimizerMemoryPath, `${JSON.stringify(normalized)}\n`, "utf8");
}

export async function readOptimizerMemory(userId = null, styleProfileId = null) {
  const scope = buildRuntimeScope(userId, styleProfileId);
  try {
    if (!existsSync(scope.optimizerMemoryPath)) {
      return [];
    }
    const raw = await readFile(scope.optimizerMemoryPath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return normalizeRecord(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function writeOptimizerPlaybook(playbook) {
  const scope = buildRuntimeScope(playbook?.userId || null, playbook?.styleProfileId || null);
  await mkdir(scope.logsDir, { recursive: true });
  await writeJsonFileAtomic(scope.optimizerPlaybookPath, playbook);
}

export async function readOptimizerPlaybook(userId = null, styleProfileId = null) {
  const scope = buildRuntimeScope(userId, styleProfileId);
  try {
    if (!existsSync(scope.optimizerPlaybookPath)) {
      return null;
    }
    return await readJsonFileWithRecovery(scope.optimizerPlaybookPath, null, {
      normalize: (value) => value,
      rewriteOnFailure: false
    });
  } catch {
    return null;
  }
}

export async function writeOptimizerJudgePrompt(text, userId = null, styleProfileId = null) {
  const scope = buildRuntimeScope(userId, styleProfileId);
  await mkdir(scope.logsDir, { recursive: true });
  await writeTextFileAtomic(scope.optimizerJudgePromptPath, `${String(text || "").trim()}\n`);
}

export async function readOptimizerJudgePrompt(userId = null, styleProfileId = null) {
  const scope = buildRuntimeScope(userId, styleProfileId);
  try {
    if (!existsSync(scope.optimizerJudgePromptPath)) {
      return "";
    }
    return normalizeWhitespace(await readFile(scope.optimizerJudgePromptPath, "utf8"));
  } catch {
    return "";
  }
}

export function buildDistilledStyleSummaryFromPlaybook(playbook = {}) {
  if (!playbook || typeof playbook !== "object") {
    return "";
  }

  const sectionLabels = {
    general: "全局蒸馏约束",
    concept: "概念问题处理",
    audit: "形式逻辑审查",
    historical: "现实/历史判断"
  };

  const lines = [
    "该风格以训练蒸馏结果为主。",
    "句法默认从规定、限度、推进和结果来展开，不以整齐反转句式充当论证骨架。"
  ];
  for (const key of ["general", "concept", "audit", "historical"]) {
    if (Array.isArray(playbook[key]) && playbook[key].length) {
      const cleaned = playbook[key]
        .map((item) => sanitizePlaybookRule(item))
        .filter(Boolean)
        .slice(0, 6);
      if (!cleaned.length) {
        continue;
      }
      lines.push(`${sectionLabels[key]}:`);
      cleaned.forEach((item) => lines.push(`- ${item}`));
    }
  }

  return normalizeWhitespace(lines.join("\n"));
}

export async function buildOptimizerMemoryContext(userPrompt, userId = null, styleProfileId = null) {
  const prompt = normalizeWhitespace(userPrompt || "");
  if (!prompt) {
    return "";
  }

  const promptClass = classifyPrompt(prompt);
  const promptTokens = tokenizePrompt(prompt);
  const [memory, playbook] = await Promise.all([
    readOptimizerMemory(userId, styleProfileId),
    readOptimizerPlaybook(userId, styleProfileId)
  ]);

  const similarFailures = memory
    .filter((item) => {
      if (item.promptClass !== promptClass) {
        return false;
      }
      return (
        item?.qualityJudge?.needs_rewrite === true ||
        item?.strictLogicJudge?.passed_strict === false ||
        item?.historiographyJudge?.passed_strict === false
      );
    })
    .map((item) => ({
      ...item,
      similarity: jaccardSimilarity(promptTokens, item.promptTokens)
    }))
    .filter((item) => item.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 3);

  const lines = [
    "Optimization memory active.",
    "Use the following failure patterns to steer the answer away from known weak trajectories."
  ];

  if (playbook?.general?.length) {
    lines.push("General high-priority corrections:");
    playbook.general.slice(0, 6).forEach((item) => lines.push(`- ${item}`));
  }

  if (promptClass === "historical" && playbook?.historical?.length) {
    lines.push("Historical-analysis corrections:");
    playbook.historical.slice(0, 6).forEach((item) => lines.push(`- ${item}`));
  }

  if (promptClass === "concept" && playbook?.concept?.length) {
    lines.push("Concept-answer corrections:");
    playbook.concept.slice(0, 6).forEach((item) => lines.push(`- ${item}`));
  }

  if (promptClass === "audit" && playbook?.audit?.length) {
    lines.push("Audit/revision corrections:");
    playbook.audit.slice(0, 6).forEach((item) => lines.push(`- ${item}`));
  }

  if (similarFailures.length) {
    lines.push("Nearest failure memories:");
    for (const item of similarFailures) {
      lines.push(`Prompt: ${item.prompt}`);
      for (const issue of item.issues.map((entry) => sanitizePlaybookRule(entry)).filter(Boolean).slice(0, 4)) {
        lines.push(`- ${issue}`);
      }
    }
  }

  return lines.join("\n");
}
