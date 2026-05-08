export const judgeNumericFields = [
  "formal_logic",
  "premise_visibility",
  "step_validity",
  "concept_stability",
  "no_large_leaps",
  "support_strength",
  "question_accuracy",
  "quote_verification",
  "quote_layer_separation",
  "quote_discipline",
  "textual_grounding",
  "prose_tightness",
  "structure_discipline",
  "overall"
];

export const judgeFlagFields = [
  "has_hidden_premise",
  "has_concept_jump",
  "has_equivocation",
  "has_circularity",
  "has_insufficient_support"
];

export function normalizeJudgeRecord(record) {
  const normalized = {};

  for (const field of judgeNumericFields) {
    const value = Number.parseFloat(record?.[field]);
    normalized[field] = Number.isFinite(value)
      ? Math.max(0, Math.min(10, Number(value.toFixed(1))))
      : 0;
  }

  for (const field of judgeFlagFields) {
    normalized[field] = Boolean(record?.[field]);
  }

  normalized.summary = typeof record?.summary === "string" ? record.summary.trim() : "";
  normalized.issues = Array.isArray(record?.issues)
    ? record.issues.filter((item) => typeof item === "string" && item.trim()).slice(0, 8)
    : [];
  normalized.strengths = Array.isArray(record?.strengths)
    ? record.strengths.filter((item) => typeof item === "string" && item.trim()).slice(0, 5)
    : [];

  return normalized;
}

export function extractJsonObject(rawText) {
  const raw = String(rawText || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end >= start ? raw.slice(start, end + 1) : raw;
}

export function averageJudgeFields(records) {
  const safe = Array.isArray(records) ? records.filter(Boolean) : [];
  const count = Math.max(safe.length, 1);
  return Object.fromEntries(
    judgeNumericFields.map((field) => [
      field,
      (
        safe.reduce((sum, item) => sum + Number(item?.[field] || 0), 0) / count
      ).toFixed(2)
    ])
  );
}

export function aggregateJudgeFlags(records) {
  const safe = Array.isArray(records) ? records.filter(Boolean) : [];
  const count = Math.max(safe.length, 1);
  return Object.fromEntries(
    judgeFlagFields.map((field) => [
      field,
      (
        (safe.reduce((sum, item) => sum + (item?.[field] ? 1 : 0), 0) / count) *
        100
      ).toFixed(1)
    ])
  );
}

export function weightedJudgeScore(record) {
  const score = normalizeJudgeRecord(record);
  return (
    score.overall * 4 +
    score.question_accuracy * 3 +
    score.formal_logic * 3 +
    score.no_large_leaps * 3 +
    score.premise_visibility * 2 +
    score.step_validity * 2 +
    score.concept_stability * 2 +
    score.support_strength * 2 +
    score.quote_discipline * 2 +
    score.textual_grounding * 2 +
    score.quote_verification * 1.5 +
    score.quote_layer_separation * 1.5 +
    score.structure_discipline * 1.5 +
    score.prose_tightness
  );
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}
