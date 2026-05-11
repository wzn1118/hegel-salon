import { validateReplyQuotes } from "./hegelQuoteValidation.mjs";

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function includesAny(text, values = []) {
  return values.some((value) => String(text || "").includes(String(value)));
}

function countMatches(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

function getDetectedConceptIds(conceptContext = {}) {
  return (conceptContext.detected_concepts || [])
    .map((item) => item?.id)
    .filter(Boolean);
}

function warning(code, message, revision, severity = "medium") {
  return { code, message, revision, severity };
}

export function detectUnsupportedQuotes(reply, corpusContext) {
  const validation = validateReplyQuotes(reply, corpusContext);
  if (validation.passed) {
    return [];
  }

  return [
    warning(
      "unsupported_quotes",
      `Unsupported quoted segments: ${validation.invalidQuotedSegments.slice(0, 4).join(" | ")}`,
      "Remove unsupported quotation marks or replace the wording with exact retrieved evidence.",
      "high"
    )
  ];
}

export function detectConceptualNameDropping(reply, conceptContext = {}) {
  const text = normalizeWhitespace(reply);
  const ids = getDetectedConceptIds(conceptContext);
  const conceptNames = (conceptContext.concept_bundle || []).flatMap((concept) => [
    concept.zh,
    concept.de,
    concept.id?.replace(/_/g, " ")
  ]).filter(Boolean);

  const hits = conceptNames.filter((name) => text.includes(name));
  const abstractionHits = countMatches(
    text,
    /普遍性|特殊性|个别性|中介|否定性|现实性|理念|精神|概念|辩证|universal|mediation|actuality|negativity|concept/gi
  );
  const hasDefinitionCue = /所谓|意思是|在这里|我称之为|不是.*而是|means|by .* I mean|defined as/i.test(text);

  if ((hits.length >= 4 || abstractionHits >= 8 || ids.length >= 3) && !hasDefinitionCue) {
    return [
      warning(
        "conceptual_name_dropping",
        "The reply invokes multiple Hegelian concepts without enough local definition.",
        "Define each load-bearing concept locally and show its role in the movement.",
        "medium"
      )
    ];
  }

  return [];
}

export function detectModernOverextension(reply, route = {}, userMessage = "") {
  const text = normalizeWhitespace(reply);
  const modernMode =
    route?.mode === "modern_judgment_mode" ||
    /AI|人工智能|算法|社交媒体|平台|互联网|现代|当代|今天|如今/i.test(userMessage);

  if (!modernMode) {
    return [];
  }

  const hasBoundary = /延伸|推论|类比|边界|不能说|没有直接谈到|并未直接|modern extension|analogy|boundary/i.test(text);
  const riskyDirectness = /黑格尔(会|将|必然|一定|直接|已经).*?(AI|人工智能|社交媒体|平台|互联网)/i.test(text);

  if (!hasBoundary || riskyDirectness) {
    return [
      warning(
        "modern_overextension",
        "The reply does not clearly mark the boundary between Hegelian doctrine and modern extension.",
        "State what is grounded in Hegel's doctrine and what is your bounded extension to the modern object.",
        "high"
      )
    ];
  }

  return [];
}

export function detectMisreadingRisk(reply, conceptContext = {}) {
  const text = normalizeWhitespace(reply);
  const warnings = conceptContext.misreading_warnings || [];
  const issues = [];

  if (
    warnings.some((item) => item.concept === "freedom") &&
    /自由(就是|即是|等于).{0,12}(想|任性|选择|欲望)/u.test(text)
  ) {
    issues.push(
      warning(
        "freedom_misreading",
        "The reply risks equating freedom with arbitrary choice.",
        "Revise freedom as rational self-determination, distinguishing it from arbitrariness.",
        "high"
      )
    );
  }

  if (
    warnings.some((item) => item.concept === "actuality" || item.concept === "rationality") &&
    /凡是存在|一切现实.*合理|现实.*都.*正当|whatever exists is rational/i.test(text)
  ) {
    issues.push(
      warning(
        "actuality_misreading",
        "The reply risks turning actuality/rationality into status-quo apology.",
        "Distinguish Wirklichkeit from mere existence and rational comprehension from justification.",
        "high"
      )
    );
  }

  if (
    warnings.some((item) => item.concept === "master_slave") &&
    /主奴辩证法(就是|等于|无非是).{0,16}阶级斗争/u.test(text)
  ) {
    issues.push(
      warning(
        "master_slave_misreading",
        "The reply collapses lordship and bondage into class struggle.",
        "Mark class struggle as a later extension, not the immediate Hegelian structure.",
        "high"
      )
    );
  }

  if (
    warnings.some((item) => item.concept === "sublation") &&
    /扬弃(就是|等于|只是).{0,12}(否定|取消|消灭)/u.test(text)
  ) {
    issues.push(
      warning(
        "sublation_misreading",
        "The reply risks treating Aufhebung as simple cancellation.",
        "State what is cancelled, preserved, and raised.",
        "high"
      )
    );
  }

  return issues;
}

export function detectMissingDialecticalMovement(reply, dialecticalPlan = {}) {
  const text = normalizeWhitespace(reply);
  const requiredCues = [
    /首先|起初|直接|immediate/i,
    /限制|限度|片面|抽象|limit/i,
    /矛盾|张力|contradiction/i,
    /中介|通过|mediation|mediate/i,
    /因此|由此|更高|规定|结论|therefore/i
  ];
  const hits = requiredCues.filter((pattern) => pattern.test(text)).length;

  if (hits < 3 && dialecticalPlan?.object) {
    return [
      warning(
        "missing_dialectical_movement",
        "The reply does not visibly follow the dialectical plan's movement.",
        "Rewrite around immediate definition, internal limit, contradiction, mediation, and higher determination.",
        "medium"
      )
    ];
  }

  return [];
}

export function detectV2MisreadingRisk(reply, conceptContext = {}) {
  const text = normalizeWhitespace(reply);
  const warnings = conceptContext.misreading_warnings || [];
  const issues = [];

  if (
    warnings.some((item) => item.concept === "freedom") &&
    /自由(就是|即是|等于|无非是).{0,20}(想干什么|想做什么|任性|随心所欲|任意|欲望|选择)|freedom\s+(is|means).{0,30}(choice|desire|license|whatever)/iu.test(text)
  ) {
    issues.push(
      warning(
        "freedom_misreading",
        "The reply risks equating freedom with arbitrary choice.",
        "Revise freedom as rational self-determination, distinguishing it from arbitrariness.",
        "high"
      )
    );
  }

  if (
    warnings.some((item) => item.concept === "actuality" || item.concept === "rationality") &&
    /凡是存在|一切现实.*合理|现实.*都.*正当|现实.*都.*合理|whatever exists is rational|actuality\s+means\s+existence/i.test(text)
  ) {
    issues.push(
      warning(
        "actuality_misreading",
        "The reply risks turning actuality/rationality into status-quo apology.",
        "Distinguish Wirklichkeit from mere existence and rational comprehension from justification.",
        "high"
      )
    );
  }

  if (
    warnings.some((item) => item.concept === "master_slave") &&
    /主奴辩证法(就是|等于|无非是).{0,24}阶级斗争|lordship.*bondage.*(is|equals).{0,30}class struggle/i.test(text)
  ) {
    issues.push(
      warning(
        "master_slave_misreading",
        "The reply collapses lordship and bondage into class struggle.",
        "Mark class struggle as a later extension, not the immediate Hegelian structure.",
        "high"
      )
    );
  }

  if (
    warnings.some((item) => item.concept === "sublation") &&
    /扬弃(就是|等于|只是|无非是).{0,16}(否定|取消|消灭)|Aufhebung\s+(is|means).{0,24}(cancel|destroy|negate)/iu.test(text)
  ) {
    issues.push(
      warning(
        "sublation_misreading",
        "The reply risks treating Aufhebung as simple cancellation.",
        "State what is cancelled, preserved, and raised.",
        "high"
      )
    );
  }

  return issues;
}

export function detectCitationDisciplineFailure(reply, corpusContext = {}, route = {}) {
  const text = normalizeWhitespace(reply);
  const quoteSensitive = route?.mode === "citation_mode" || /原文|引文|quote|quotation|出处/i.test(text);
  const validation = validateReplyQuotes(reply, corpusContext);
  const hasQuote = validation.candidateSegments.length > 0;
  const hasSourceCue = /《|Science of Logic|Phenomenology|Philosophy of Right|Encyclopaedia|出处|章节|section|locator|Preface|Introduction/i.test(text);

  if (quoteSensitive && !hasSourceCue) {
    return [
      warning(
        "citation_source_missing",
        "The reply is quote/source sensitive but does not visibly name source status.",
        "Name the work or say that no checked source was found; do not answer by style alone.",
        "high"
      )
    ];
  }

  if (hasQuote && !validation.passed) {
    return [
      warning(
        "citation_validation_failure",
        "The reply contains direct quotation that quote validation did not support.",
        "Remove unsupported direct quotations or replace them with exact retrieved wording.",
        "high"
      )
    ];
  }

  return [];
}

function detectLayerFailure(reply, route = {}) {
  const text = normalizeWhitespace(reply);
  const isSubstantive =
    route?.mode !== "writing_mode" || /黑格尔|Hegel|概念|原文|现代|批评/u.test(text);
  if (!isSubstantive) return [];

  const layerPatterns = [
    /原文|文本证据|可证据支持|primary text|evidence/i,
    /解释|转述|paraphrase|interpret/i,
    /延伸|现代|当代|推论|modern extension/i,
    /概括|总结|system summary|系统/i
  ];
  const layerHits = layerPatterns.filter((pattern) => pattern.test(text)).length;

  if (layerHits < 2) {
    return [
      warning(
        "answer_layer_missing",
        "The reply does not clearly separate evidence, interpretation, modern extension, and system summary.",
        "Add clear layer markers in substance: primary-text evidence, interpretive paraphrase, modern extension, and system-generated summary.",
        "medium"
      )
    ];
  }

  return [];
}

function detectConceptCoverageFailure(reply, conceptContext = {}) {
  const text = normalizeWhitespace(reply);
  const bundle = conceptContext.concept_bundle || [];
  if (!bundle.length) return [];

  const required = bundle.slice(0, 5);
  const covered = required.filter((concept) =>
    [concept.zh, concept.de, concept.id?.replace(/_/g, " "), ...(concept.aliases || []).slice(0, 3)]
      .filter(Boolean)
      .some((name) => text.includes(String(name)))
  );

  if (covered.length / required.length < 0.4) {
    return [
      warning(
        "concept_coverage_low",
        "The reply does not visibly cover enough load-bearing concepts detected for the query.",
        "Name and determine the top detected concepts that carry the answer.",
        conceptContext.risk_level === "high" ? "high" : "medium"
      )
    ];
  }

  return [];
}

function detectUnanchoredAssertionRisk(reply, corpusContext = {}, conceptContext = {}) {
  const text = normalizeWhitespace(reply);
  const sourceAnchors = corpusContext.sourceAnchors || [];
  const hasDoctrinalCue = /黑格尔|Hegel|逻辑学|精神现象学|法哲学|Science of Logic|Phenomenology|Philosophy of Right/i.test(text);
  const anchored = sourceAnchors.some((anchor) => anchor.anchored);

  if (hasDoctrinalCue && conceptContext.risk_level === "high" && !anchored) {
    return [
      warning(
        "unanchored_doctrinal_assertion",
        "The reply makes doctrinal claims under high concept risk without a visible source anchor.",
        "Tie the doctrinal claim to retrieved corpus evidence or state that the source anchor is not available.",
        "high"
      )
    ];
  }

  return [];
}

function detectCitationLayerConfusion(reply) {
  const text = normalizeWhitespace(reply);
  if (/概念图谱.*(原文|引文|黑格尔说)|graph.*quote|系统.*原文/u.test(text)) {
    return [
      warning(
        "citation_layer_confusion",
        "The reply risks treating graph/system material as primary-text wording.",
        "Separate graph guidance from primary-text quotation and never quote the graph as Hegel.",
        "high"
      )
    ];
  }
  return [];
}

function detectDialecticalChainBreak(reply, dialecticalPlan = {}) {
  const text = normalizeWhitespace(reply);
  const chain = dialecticalPlan.concept_transition_chain || [];
  if (chain.length < 3) return [];

  const hits = chain.filter((item) => text.includes(String(item).replace(/_/g, " "))).length;
  const hasMovementCue = /因此|由此|转化|过渡|中介|限度|矛盾|therefore|transition|mediate|limit/i.test(text);
  if (hits < 2 && !hasMovementCue) {
    return [
      warning(
        "dialectical_chain_break",
        "The reply does not visibly traverse the planned concept-transition chain.",
        "Make the transition chain explicit enough for the reader to see why the conclusion follows.",
        "medium"
      )
    ];
  }

  return [];
}

function scoreCoverage(reply, conceptContext = {}) {
  const text = normalizeWhitespace(reply);
  const bundle = conceptContext.concept_bundle || [];
  if (!bundle.length) return 10;

  const required = bundle.slice(0, 6);
  const covered = required.filter((concept) =>
    [concept.zh, concept.de, concept.id?.replace(/_/g, " "), ...(concept.aliases || []).slice(0, 2)]
      .filter(Boolean)
      .some((name) => text.includes(String(name)))
  ).length;
  return Number(Math.min(10, (covered / required.length) * 10).toFixed(1));
}

function scoreConceptualIntegrity(warnings = []) {
  const penalty = warnings.reduce((sum, item) => {
    if (item.severity === "high") return sum + 2.5;
    if (item.severity === "medium") return sum + 1.2;
    return sum + 0.5;
  }, 0);
  return Number(Math.max(0, 10 - penalty).toFixed(1));
}

function overallSeverity(warnings = []) {
  if (warnings.some((item) => item.severity === "high")) return "high";
  if (warnings.some((item) => item.severity === "medium")) return "medium";
  if (warnings.length) return "low";
  return "none";
}

export function auditHegelReply({
  reply,
  userMessage = "",
  corpusContext = {},
  conceptContext = {},
  dialecticalPlan = {},
  modeRoute = {},
  quoteValidation = null
} = {}) {
  const warnings = [
    ...detectUnsupportedQuotes(reply, corpusContext),
    ...detectConceptualNameDropping(reply, conceptContext),
    ...detectModernOverextension(reply, modeRoute, userMessage),
    ...detectMisreadingRisk(reply, conceptContext),
    ...detectV2MisreadingRisk(reply, conceptContext),
    ...detectMissingDialecticalMovement(reply, dialecticalPlan),
    ...detectCitationDisciplineFailure(reply, corpusContext, modeRoute),
    ...detectLayerFailure(reply, modeRoute),
    ...detectConceptCoverageFailure(reply, conceptContext),
    ...detectUnanchoredAssertionRisk(reply, corpusContext, conceptContext),
    ...detectCitationLayerConfusion(reply),
    ...detectDialecticalChainBreak(reply, dialecticalPlan)
  ];

  if (quoteValidation && quoteValidation.passed === false) {
    warnings.push(
      warning(
        "existing_quote_validation_failed",
        "Existing quote validation failed for this reply.",
        "Repair quote discipline using only retrieved evidence.",
        "high"
      )
    );
  }

  const deduped = [];
  const seen = new Set();
  for (const item of warnings) {
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    deduped.push(item);
  }

  const blocking = deduped.filter((item) => item.severity === "high");
  const nonblocking = deduped.filter((item) => item.severity !== "high");
  const coverage_score = scoreCoverage(reply, conceptContext);
  const conceptual_integrity_score = scoreConceptualIntegrity(deduped);
  const severity = overallSeverity(deduped);

  return {
    passed: blocking.length === 0,
    severity,
    warnings: deduped.map(({ code, message, severity: itemSeverity }) => ({
      code,
      message,
      severity: itemSeverity
    })),
    blocking_warnings: blocking.map(({ code, message, severity: itemSeverity }) => ({
      code,
      message,
      severity: itemSeverity
    })),
    nonblocking_warnings: nonblocking.map(({ code, message, severity: itemSeverity }) => ({
      code,
      message,
      severity: itemSeverity
    })),
    coverage_score,
    conceptual_integrity_score,
    required_revision_instructions: blocking.map((item) => item.revision),
    advisory_revision_instructions: nonblocking.map((item) => item.revision)
  };
}
