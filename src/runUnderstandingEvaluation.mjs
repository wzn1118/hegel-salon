import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCodexOpenAIConfig } from "./codexConfig.mjs";
import { projectRoot, researchDir } from "./projectPaths.mjs";

const apiUrl = String(process.env.HEGEL_API_URL || "").trim();
if (!apiUrl) {
  console.error("Set HEGEL_API_URL to the chat endpoint before running the understanding evaluation.");
  process.exit(1);
}

const judgeModel = process.env.HEGEL_EVAL_MODEL || "gpt-5.3-codex";
const concurrency = Number.parseInt(process.env.HEGEL_EVAL_CONCURRENCY || "2", 10) || 2;
const cliLimit = process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1];
const sampleLimit = Number.parseInt(cliLimit || process.env.HEGEL_UNDERSTANDING_LIMIT || "0", 10) || 0;
const goldensPath = join(projectRoot, "eval", "hegel-understanding-goldens.jsonl");

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

function extractJsonObject(rawText) {
  const raw = String(rawText || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end >= start ? raw.slice(start, end + 1) : raw;
}

function clampScore(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(10, Number(numeric.toFixed(1))));
}

function normalizeJudge(raw = {}) {
  const scores = raw.scores || raw;
  const normalized = {
    concept_accuracy: clampScore(scores.concept_accuracy),
    dialectical_movement: clampScore(scores.dialectical_movement),
    citation_discipline: clampScore(scores.citation_discipline),
    misreading_avoidance: clampScore(scores.misreading_avoidance),
    modern_boundary_control: clampScore(scores.modern_boundary_control),
    answer_usefulness: clampScore(scores.answer_usefulness)
  };
  const overall =
    (normalized.concept_accuracy * 0.24) +
    (normalized.dialectical_movement * 0.20) +
    (normalized.citation_discipline * 0.18) +
    (normalized.misreading_avoidance * 0.16) +
    (normalized.modern_boundary_control * 0.10) +
    (normalized.answer_usefulness * 0.12);

  return {
    scores: normalized,
    overall: Number(overall.toFixed(2)),
    passed: Boolean(raw.passed) && overall >= 8,
    summary: String(raw.summary || ""),
    issues: Array.isArray(raw.issues) ? raw.issues.map(String).slice(0, 10) : [],
    strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String).slice(0, 8) : []
  };
}

async function loadGoldens() {
  const raw = await readFile(goldensPath, "utf8");
  const items = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return sampleLimit > 0 ? items.slice(0, sampleLimit) : items;
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
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return requestSalon(prompt, attempt + 1);
  }
}

function buildJudgePrompt(golden, replyPayload) {
  return [
    "Evaluate this Hegel Salon answer for concept-system understanding.",
    "Return JSON only.",
    "Scores are 0.0 to 10.0. Use exactly these score fields:",
    "concept_accuracy, dialectical_movement, citation_discipline, misreading_avoidance, modern_boundary_control, answer_usefulness.",
    "A good answer must distinguish primary-text evidence, interpretive paraphrase, modern extension when relevant, and system-generated summary.",
    "Do not reward Hegelian style if concept movement and source discipline are weak.",
    "",
    "Golden case:",
    JSON.stringify(golden, null, 2),
    "",
    "Answer payload:",
    JSON.stringify(
      {
        reply: normalizeWhitespace(replyPayload.reply),
        validation: replyPayload.validation,
        selfAudit: replyPayload.selfAudit,
        qualityJudge: replyPayload.qualityJudge,
        strictLogicJudge: replyPayload.strictLogicJudge,
        historiographyJudge: replyPayload.historiographyJudge,
        attempts: replyPayload.attempts
      },
      null,
      2
    ),
    "",
    "Return schema:",
    JSON.stringify(
      {
        scores: {
          concept_accuracy: 0,
          dialectical_movement: 0,
          citation_discipline: 0,
          misreading_avoidance: 0,
          modern_boundary_control: 0,
          answer_usefulness: 0
        },
        passed: false,
        summary: "one sentence",
        issues: ["short issue"],
        strengths: ["short strength"]
      },
      null,
      2
    )
  ].join("\n");
}

async function requestJudge(config, golden, replyPayload, attempt = 1) {
  const response = await fetch(toApiUrl(config.baseURL, "chat/completions"), {
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
            "You are a strict evaluator for a Hegel concept-system simulator.",
            "Return JSON only. Penalize style-only answers, fake quotations, missing concept movement, and modern overextension."
          ].join("\n")
        },
        {
          role: "user",
          content: buildJudgePrompt(golden, replyPayload)
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
    return requestJudge(config, golden, replyPayload, attempt + 1);
  }

  const raw = extractMessageText(await response.json());
  try {
    return normalizeJudge(JSON.parse(extractJsonObject(raw)));
  } catch {
    if (attempt >= 3) {
      throw new Error(`Judge JSON parse failed: ${raw.slice(0, 400)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return requestJudge(config, golden, replyPayload, attempt + 1);
  }
}

function average(results, field) {
  const judged = results.filter((item) => item.judge);
  if (!judged.length) return 0;
  const total = judged.reduce((sum, item) => sum + Number(field(item.judge) || 0), 0);
  return Number((total / judged.length).toFixed(2));
}

function groupKey(item, key) {
  const value = item[key];
  if (Array.isArray(value)) return value.length ? value.join(",") : "none";
  return value ? String(value) : "none";
}

function averageJudge(items, selector) {
  const judged = items.filter((item) => item.judge);
  if (!judged.length) return 0;
  return Number(
    (
      judged.reduce((sum, item) => sum + Number(selector(item.judge) || 0), 0) /
      judged.length
    ).toFixed(2)
  );
}

function aggregateBy(results, key, selector = (judge) => judge.overall) {
  const groups = new Map();
  for (const item of results.filter((entry) => entry.judge)) {
    const keys = Array.isArray(item[key]) && item[key].length ? item[key] : [groupKey(item, key)];
    for (const value of keys) {
      const normalized = String(value || "none");
      const group = groups.get(normalized) || [];
      group.push(item);
      groups.set(normalized, group);
    }
  }

  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      count: items.length,
      average: averageJudge(items, selector),
      passRate: Number(
        (
          items.filter((item) => item.judge?.passed).length /
          Math.max(1, items.length)
        ).toFixed(2)
      )
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function aggregateSelfAuditWarnings(results) {
  const counts = new Map();
  for (const item of results) {
    for (const warning of item.selfAudit?.warnings || []) {
      const code = warning.code || "unknown";
      counts.set(code, (counts.get(code) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function buildMarkdownReport(results) {
  const judged = results.filter((item) => item.judge);
  const passed = judged.filter((item) => item.judge.passed).length;
  const lines = [
    "# Hegel Understanding Evaluation Report",
    "",
    `Date: ${new Date().toISOString()}`,
    `Sample size: ${judged.length}`,
    `Passed: ${passed}/${judged.length}`,
    `Judge model: ${judgeModel}`,
    `API under test: ${apiUrl}`,
    "",
    "## Aggregate Scores",
    "",
    `- overall: ${average(results, (judge) => judge.overall)}`,
    `- concept_accuracy: ${average(results, (judge) => judge.scores.concept_accuracy)}`,
    `- dialectical_movement: ${average(results, (judge) => judge.scores.dialectical_movement)}`,
    `- citation_discipline: ${average(results, (judge) => judge.scores.citation_discipline)}`,
    `- misreading_avoidance: ${average(results, (judge) => judge.scores.misreading_avoidance)}`,
    `- modern_boundary_control: ${average(results, (judge) => judge.scores.modern_boundary_control)}`,
    `- answer_usefulness: ${average(results, (judge) => judge.scores.answer_usefulness)}`,
    "",
    "## Lowest Cases",
    ""
  ];

  const byMode = aggregateBy(results, "mode");
  if (byMode.length) {
    lines.push("## By Mode", "");
    for (const item of byMode) {
      lines.push(`- ${item.name}: n=${item.count}, avg=${item.average}, passRate=${item.passRate}`);
    }
    lines.push("");
  }

  const byDomain = aggregateBy(results, "concept_domains");
  if (byDomain.length) {
    lines.push("## By Concept Domain", "");
    for (const item of byDomain) {
      lines.push(`- ${item.name}: n=${item.count}, avg=${item.average}, passRate=${item.passRate}`);
    }
    lines.push("");
  }

  const warningCounts = aggregateSelfAuditWarnings(results);
  if (warningCounts.length) {
    lines.push("## Self-Audit Warning Clusters", "");
    for (const item of warningCounts.slice(0, 16)) {
      lines.push(`- ${item.code}: ${item.count}`);
    }
    lines.push("");
  }

  const low = judged
    .sort((left, right) => Number(left.judge.overall) - Number(right.judge.overall))
    .slice(0, 12);

  for (const item of low) {
    lines.push(`- ${item.id} overall=${item.judge.overall} prompt: ${item.prompt}`);
    if (item.judge.summary) lines.push(`  summary: ${item.judge.summary}`);
    if (item.judge.issues.length) lines.push(`  issues: ${item.judge.issues.join(" | ")}`);
  }

  return lines.join("\n");
}

async function runWorker(config, queue, results) {
  while (queue.length) {
    const golden = queue.shift();
    if (!golden) return;

    try {
      const response = await requestSalon(golden.prompt);
      const judge = await requestJudge(config, golden, response);
      results.push({
        ...golden,
        reply: response.reply,
        validation: response.validation,
        selfAudit: response.selfAudit,
        mode: response.modeRoute?.mode || response.mode || response.selfAudit?.mode || golden.mode || "unknown",
        concept_domains:
          response.conceptGraphContext?.concept_domains ||
          response.corpusContext?.conceptGraphContext?.concept_domains ||
          golden.concept_domains ||
          [],
        attempts: response.attempts,
        judge
      });
      console.log(`${golden.id} done overall=${judge.overall}`);
    } catch (error) {
      results.push({
        ...golden,
        error: error instanceof Error ? error.message : String(error)
      });
      console.error(`${golden.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function main() {
  const config = loadCodexOpenAIConfig();
  if (!config.apiKey || !config.baseURL) {
    throw new Error("Missing Codex/OpenAI configuration for understanding judge.");
  }

  const goldens = await loadGoldens();
  if (goldens.length < 50 && sampleLimit <= 0) {
    throw new Error(`Expected at least 50 understanding goldens, found ${goldens.length}.`);
  }
  if (goldens.length < 120 && sampleLimit <= 0) {
    throw new Error(`V2 requires at least 120 understanding goldens, found ${goldens.length}.`);
  }

  const queue = [...goldens];
  const results = [];
  console.log(`Running ${goldens.length} understanding eval prompts with judge model ${judgeModel}...`);

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => runWorker(config, queue, results))
  );

  results.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  await mkdir(researchDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(researchDir, `hegel-understanding-eval-${stamp}.json`);
  const mdPath = join(researchDir, `hegel-understanding-eval-${stamp}.md`);

  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        judgeModel,
        apiUrl,
        sampleSize: goldens.length,
        aggregates: {
          byMode: aggregateBy(results, "mode"),
          byConceptDomain: aggregateBy(results, "concept_domains"),
          selfAuditWarnings: aggregateSelfAuditWarnings(results)
        },
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
