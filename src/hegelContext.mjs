import { searchHegelCorpus } from "./hegelCorpus.mjs";
import { buildParallelCitationContext } from "./hegelParallel.mjs";
import { buildChineseTranslationContext } from "./hegelChinese.mjs";
import { buildConceptPlan, loadHegelConceptLedger } from "./hegelConcepts.mjs";
import { buildConceptContext } from "./hegelConceptGraph.mjs";
import { buildDialecticalPlan } from "./hegelDialectic.mjs";
import { buildHistoricalReferenceContext } from "./hegelHistorical.mjs";
import { renderModeRouterContext, routeHegelMode } from "./hegelModeRouter.mjs";
import {
  mapSourceAnchorsToHits,
  renderSourceAnchorContext
} from "./hegelSourceAnchors.mjs";

function compressPassage(text, maxLength = 900) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}...`;
}

function inferLocator(hit) {
  const pageTitle = String(hit?.pageTitle || "");
  const content = String(hit?.content || "");
  const sectionMatch =
    pageTitle.match(/§\s*\d+[a-z]?/i) ||
    content.match(/§\s*\d+[a-z]?/i) ||
    pageTitle.match(/chapter\s+[ivxlcdm0-9]+/i) ||
    pageTitle.match(/introduction|preface|remark|addition/i);

  return sectionMatch ? sectionMatch[0] : pageTitle || "unknown locator";
}

function looksChineseQuery(text) {
  return /[\u4e00-\u9fff]/u.test(String(text || ""));
}

function detectPromptFamilies(text) {
  const prompt = String(text || "");
  const families = new Set();
  const rules = [
    [/法哲学|法权|权利|philosophy of right|recht/i, "philosophy-of-right"],
    [/精神现象学|phenomenology/i, "phenomenology"],
    [/小逻辑|大逻辑|逻辑学|science of logic|logic/i, "science-of-logic"],
    [/精神哲学|主观精神|客观精神|百科全书|encyclopaedia|encyclopedia|philosophy of spirit/i, "encyclopaedia-spirit"],
    [/自然哲学|nature/i, "encyclopaedia-nature"],
    [/历史哲学|世界历史|philosophy of history/i, "philosophy-of-history"],
    [/哲学史|history of philosophy/i, "history-of-philosophy"],
    [/宗教哲学|religion/i, "philosophy-of-religion"],
    [/美学|艺术|aesthetic|art/i, "aesthetics"],
    [/早期著作|神学|theological|early/i, "early-writings"]
  ];

  for (const [pattern, family] of rules) {
    if (pattern.test(prompt)) {
      families.add(family);
    }
  }

  return families;
}

function familyFromHit(hit) {
  const workId = String(hit?.workId || "");
  const title = String(hit?.workTitle || "");

  if (workId === "philosophy-of-right" || /philosophy of right/i.test(title)) {
    return "philosophy-of-right";
  }

  if (workId === "phenomenology" || /phenomenology/i.test(title)) {
    return "phenomenology";
  }

  if (
    ["science-of-logic", "shorter-logic"].includes(workId) ||
    /science of logic|shorter logic|logic/i.test(title)
  ) {
    return "science-of-logic";
  }

  if (
    ["encyclopaedia", "subjective-spirit", "objective-spirit", "subjective-spirit-shorter"].includes(workId) ||
    /encyclopaedia|philosophy of spirit|subjective spirit|objective spirit/i.test(title)
  ) {
    return "encyclopaedia-spirit";
  }

  if (workId === "philosophy-of-nature" || /nature/i.test(title)) {
    return "encyclopaedia-nature";
  }

  if (workId === "philosophy-of-history" || /world history/i.test(title)) {
    return "philosophy-of-history";
  }

  if (workId === "history-of-philosophy" || /history of philosophy/i.test(title)) {
    return "history-of-philosophy";
  }

  if (workId === "philosophy-of-religion" || /religion/i.test(title)) {
    return "philosophy-of-religion";
  }

  if (workId === "aesthetics" || /aesthetics|art/i.test(title)) {
    return "aesthetics";
  }

  return null;
}

function reorderResultsForPrompt(results, userPrompt) {
  const requestedFamilies = detectPromptFamilies(userPrompt);
  if (!requestedFamilies.size) {
    return results;
  }

  return [...results].sort((left, right) => {
    const leftScore = requestedFamilies.has(familyFromHit(left)) ? 1 : 0;
    const rightScore = requestedFamilies.has(familyFromHit(right)) ? 1 : 0;
    return rightScore - leftScore;
  });
}

function extractKeyConcepts(text) {
  const prompt = String(text || "");
  const concepts = [];
  const seen = new Set();

  function add(value) {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    concepts.push(value);
  }

  const rules = [
    [/自由/u, "自由"],
    [/任意|任性/u, "任意或任性"],
    [/意志/u, "意志"],
    [/对象/u, "对象"],
    [/与自己相合|相合/u, "与自己相合"],
    [/精神/u, "精神"],
    [/概念/u, "概念"],
    [/实体/u, "实体"],
    [/主体/u, "主体"],
    [/伦理/u, "伦理"],
    [/国家/u, "国家"],
    [/法|权利/u, "法与权利"]
  ];

  for (const [pattern, label] of rules) {
    if (pattern.test(prompt)) {
      add(label);
    }
  }

  return concepts;
}

function buildArgumentDiscipline(userPrompt, chinese, conceptPlan) {
  const chineseMode = looksChineseQuery(userPrompt);
  const requestedFamilies = [...detectPromptFamilies(userPrompt)];
  const concepts = extractKeyConcepts(userPrompt);
  const lines = [
    "Answer discipline for this query:",
    `Query language: ${chineseMode ? "Chinese" : "non-Chinese or mixed"}`,
    requestedFamilies.length
      ? `Explicitly requested work families: ${requestedFamilies.join(", ")}`
      : "No explicit work family was named in the query."
  ];

  if (chineseMode && chinese.localHits.length) {
    lines.push(
      "Primary wording mode: checked Chinese wording first. Do not translate an English line back into Chinese if checked Chinese wording is already loaded."
    );
  } else if (chineseMode) {
    lines.push(
      "Primary wording mode: Chinese answer, but no checked local Chinese wording was matched. Keep the wording layer honest."
    );
  }

  lines.push(
    "Do not begin from a verdict and then backfill reasons. First determine the load-bearing concepts in the sentence or problem."
  );
  lines.push(
    "Visible argumentative order: define the terms, justify the definition, answer at least one objection, then conclude."
  );
  lines.push(
    "Only introduce a nearby rival view when the question or the retrieved passage itself makes that rival determinately relevant."
  );
  lines.push(
    "Do not let any quotation stand in place of an argument. A cited sentence must be unfolded conceptually and defended."
  );
  lines.push(
    "State the thesis in the first person as your own view, then show why the concepts must be taken in that sense."
  );
  lines.push(
    "If the user named a work, do not let nearby works displace it. Use adjacent works only as explicit support, development, or contrast."
  );
  lines.push(
    "Do not quote editorials, translator introductions, publisher notes, or modern criticism as if Hegel wrote them."
  );

  if (concepts.length) {
    lines.push(`Key concepts requiring explicit determination: ${concepts.join(", ")}`);
  }

  if (conceptPlan?.conceptTargets?.length) {
    lines.push(
      `Concept-ledger targets: ${conceptPlan.conceptTargets
        .map((target) => target.conceptId)
        .join(", ")}`
    );
  }

  if (conceptPlan?.suppressedConcepts?.length) {
    lines.push(
      `Suppressed by user wording: ${conceptPlan.suppressedConcepts
        .map((target) => target.conceptId)
        .join(", ")}`
    );
  }

  if (chinese?.primaryEdition?.editionLabel) {
    lines.push(
      `Primary Chinese edition line selected: ${chinese.primaryEdition.editionLabel}`
    );
  }

  return {
    text: lines.join("\n"),
    queryLanguage: chineseMode ? "zh" : "other",
    preferChinesePrimary:
      chineseMode &&
      Boolean(
        chinese.primaryEdition &&
          ["checked-local", "ocr-local"].includes(
            String(chinese.primaryEdition.quoteStyle || "")
          )
      ),
    keyConcepts: concepts,
    requestedFamilies
  };
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}

function renderMisreadingWarnings(conceptGraphContext) {
  const warnings = conceptGraphContext?.misreading_warnings || [];
  if (!warnings.length) {
    return "No concept-graph misreading warnings were triggered.";
  }

  return warnings
    .slice(0, 18)
    .map((item) => `- ${item.concept || "concept"}: ${item.warning}`)
    .join("\n");
}

function renderForbiddenMoves(dialecticalPlan, modeRoute) {
  const moves = unique([
    ...(dialecticalPlan?.forbidden_moves || []),
    ...(modeRoute?.forbidden_behavior || [])
  ]);

  if (!moves.length) {
    return "No special forbidden moves beyond general source and concept discipline.";
  }

  return moves.map((item) => `- ${item}`).join("\n");
}

function buildLayeredContextText({
  conceptGraphContext,
  dialecticalPlan,
  modeRoute,
  sourceAnchors,
  corpusEvidenceText
}) {
  return [
    "[MODE ROUTER RESULT]",
    renderModeRouterContext(modeRoute),
    "",
    "[CONCEPT GRAPH CONTEXT]",
    conceptGraphContext?.contextText || "No concept graph context was available.",
    "",
    "[DIALECTICAL PLAN]",
    JSON.stringify(dialecticalPlan || {}, null, 2),
    "",
    "[MISREADING WARNINGS]",
    renderMisreadingWarnings(conceptGraphContext),
    "",
    "[FORBIDDEN MOVES]",
    renderForbiddenMoves(dialecticalPlan, modeRoute),
    "",
    "[SOURCE ANCHORS]",
    renderSourceAnchorContext(sourceAnchors),
    "",
    "[CORPUS EVIDENCE]",
    corpusEvidenceText || "No corpus evidence text was available."
  ].join("\n");
}

export async function buildCorpusContext(userPrompt) {
  const conceptGraphContext = buildConceptContext(userPrompt);
  const modeRoute = routeHegelMode(userPrompt);
  const conceptLedger = await loadHegelConceptLedger();
  const initialConceptPlan = buildConceptPlan(
    userPrompt,
    [...detectPromptFamilies(userPrompt)],
    conceptLedger
  );
  const { manifest, results: rawResults } = await searchHegelCorpus(
    userPrompt,
    8,
    initialConceptPlan,
    conceptLedger
  );
  const parallel = await buildParallelCitationContext(
    userPrompt,
    rawResults,
    initialConceptPlan
  );
  const chinese = await buildChineseTranslationContext(
    userPrompt,
    rawResults,
    parallel.entries,
    initialConceptPlan,
    conceptLedger
  );
  const historical = await buildHistoricalReferenceContext(
    userPrompt,
    rawResults,
    initialConceptPlan,
    conceptLedger
  );
  const results = reorderResultsForPrompt(rawResults, userPrompt);
  const sourceAnchors = mapSourceAnchorsToHits(conceptGraphContext, results);
  const dialecticalPlan = buildDialecticalPlan({
    userMessage: userPrompt,
    detectedConcepts: conceptGraphContext.detected_concepts,
    corpusHits: results
  });
  const queryProfile = buildArgumentDiscipline(
    userPrompt,
    chinese,
    initialConceptPlan
  );

  const lines = [
    "Full-corpus retrieval context:",
    `Corpus generated at: ${manifest.generatedAt}`,
    `Works covered in local corpus: ${manifest.works.length}`,
    `Chunks available: ${manifest.totalChunks}`,
    queryProfile.text,
    "Use the following primary-text material as quotable evidence when relevant.",
    "Only the wording recovered below or in the aligned citation bank counts as quote-ready wording for this answer.",
    "Do not treat ledgers, audits, doctrinal sheets, or metadata summaries as quotable wording.",
    "When citing, name the work, the local page title or section marker, the authority status, and whether the wording is from translation or original-language text when that is clear."
  ];

  if (!results.length) {
    if (parallel.entries.length) {
      lines.push("No ordinary ranked corpus hits were found for this query.");
      lines.push("A direct aligned citation bank was still recovered from supported works.");
      lines.push(parallel.contextText);
      lines.push(chinese.contextText);
    } else {
      lines.push("No relevant corpus hits were found for this query.");
      lines.push(chinese.contextText);
    }

    const corpusEvidenceText = lines.join("\n");

    return {
      contextText: buildLayeredContextText({
        conceptGraphContext,
        dialecticalPlan,
        modeRoute,
        sourceAnchors,
        corpusEvidenceText
      }),
      hits: [],
      parallelHits: parallel.entries,
      chinese,
      queryProfile,
      conceptPlan: initialConceptPlan,
      conceptGraphContext,
      dialecticalPlan,
      modeRoute,
      sourceAnchors,
      misreadingWarnings: conceptGraphContext.misreading_warnings,
      forbiddenMoves: dialecticalPlan.forbidden_moves
    };
  }

  if (queryProfile.preferChinesePrimary) {
    lines.push(chinese.contextText);
  }

  lines.push("Relevant primary-text hits:");

  for (const [index, hit] of results.entries()) {
    lines.push(
      [
        `Hit ${index + 1}`,
        `Work: ${hit.workTitle}`,
        `Locator: ${inferLocator(hit)}`,
        `Page title: ${hit.pageTitle}`,
        `Authority: ${hit.authority}`,
        `Verification medium: cached local text, typically translation unless the passage itself shows original-language wording`,
        `URL: ${hit.url}`,
        `Quoted passage: "${compressPassage(hit.content)}"`
      ].join("\n")
    );
  }

  if (parallel.entries.length) {
    lines.push(parallel.contextText);
  }

  if (historical.enabled) {
    lines.push(historical.contextText);
  }

  if (!queryProfile.preferChinesePrimary) {
    lines.push(chinese.contextText);
  }

  const corpusEvidenceText = lines.join("\n\n");

  return {
    contextText: buildLayeredContextText({
      conceptGraphContext,
      dialecticalPlan,
      modeRoute,
      sourceAnchors,
      corpusEvidenceText
    }),
    hits: results,
    parallelHits: parallel.entries,
    historical,
    chinese,
    queryProfile,
    conceptPlan: initialConceptPlan,
    conceptGraphContext,
    dialecticalPlan,
    modeRoute,
    sourceAnchors,
    misreadingWarnings: conceptGraphContext.misreading_warnings,
    forbiddenMoves: dialecticalPlan.forbidden_moves
  };
}
