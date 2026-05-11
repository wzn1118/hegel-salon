function normalizeArray(values) {
  return Array.isArray(values) ? values.filter(Boolean).map(String) : [];
}

function unique(values) {
  return [...new Set(normalizeArray(values))];
}

function inferFamilyFromText(text) {
  const value = String(text || "").toLowerCase();
  if (/philosophy of right|right|recht/.test(value)) return "philosophy-of-right";
  if (/phenomenology/.test(value)) return "phenomenology";
  if (/science of logic|logic/.test(value)) return "science-of-logic";
  if (/encyclopaedia|encyclopedia/.test(value)) return "encyclopaedia";
  if (/history of philosophy/.test(value)) return "history-of-philosophy";
  if (/philosophy of history|world history/.test(value)) return "philosophy-of-history";
  if (/aesthetic|art/.test(value)) return "aesthetics";
  if (/religion/.test(value)) return "philosophy-of-religion";
  if (/early|theological|positivity|love|fate/.test(value)) return "early-writings";
  return "unknown";
}

function hitFamily(hit) {
  return inferFamilyFromText(`${hit?.workId || ""} ${hit?.workTitle || ""} ${hit?.pageTitle || ""}`);
}

function familyMatches(required, actual) {
  if (!required || required === "unknown") return false;
  if (required === actual) return true;
  if (required === "encyclopaedia-logic" && actual === "encyclopaedia") return true;
  if (required === "encyclopaedia-spirit" && actual === "encyclopaedia") return true;
  return actual.includes(required) || required.includes(actual);
}

function scoreAnchorHit(anchor, hit) {
  const haystack = `${hit?.workTitle || ""} ${hit?.pageTitle || ""} ${hit?.content || ""}`.toLowerCase();
  let score = 0;

  for (const query of anchor.queries) {
    const normalized = String(query || "").toLowerCase().trim();
    if (!normalized) continue;
    if (haystack.includes(normalized)) {
      score += normalized.length > 16 ? 4 : 2;
    }
  }

  const actualFamily = hitFamily(hit);
  if (anchor.required_source_families.some((family) => familyMatches(family, actualFamily))) {
    score += 4;
  }

  return score;
}

export function buildSourceAnchorQueries(conceptContext = {}) {
  const bundle = Array.isArray(conceptContext.concept_bundle)
    ? conceptContext.concept_bundle.filter(Boolean)
    : [];
  return bundle.map((concept) => ({
    concept: concept.id,
    domain: concept.domain || "unknown",
    queries: unique([
      ...normalizeArray(concept.source_queries),
      ...normalizeArray(concept.primary_locations),
      concept.zh,
      concept.de,
      concept.id?.replace(/_/g, " ")
    ]).slice(0, 10),
    required_source_families: normalizeArray(concept.required_source_families),
    primary_locations: normalizeArray(concept.primary_locations)
  }));
}

export function mapSourceAnchorsToHits(conceptContext = {}, corpusHits = []) {
  const anchors = buildSourceAnchorQueries(conceptContext);
  const hits = Array.isArray(corpusHits) ? corpusHits : [];

  return anchors.map((anchor) => {
    const rankedHits = hits
      .map((hit) => ({
        work: String(hit?.workTitle || hit?.workId || "unknown"),
        locator: String(hit?.pageTitle || hit?.url || "unknown"),
        family: hitFamily(hit),
        score: scoreAnchorHit(anchor, hit)
      }))
      .filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 4);

    return {
      ...anchor,
      anchored: rankedHits.length > 0,
      matched_hits: rankedHits
    };
  });
}

export function renderSourceAnchorContext(sourceAnchors = []) {
  if (!sourceAnchors.length) {
    return "No source anchors were generated.";
  }

  const lines = [
    "Source anchors convert graph recommendations into corpus-search obligations.",
    "They are not quotable evidence by themselves; only retrieved passages are quotable."
  ];

  for (const anchor of sourceAnchors.slice(0, 12)) {
    lines.push(
      [
        `- ${anchor.concept} (${anchor.domain})`,
        `queries: ${anchor.queries.slice(0, 6).join(" | ") || "none"}`,
        `required_source_families: ${anchor.required_source_families.join(", ") || "none"}`,
        anchor.anchored
          ? `matched_hits: ${anchor.matched_hits
              .map((hit) => `${hit.work} / ${hit.locator}`)
              .join("; ")}`
          : "matched_hits: none"
      ].join("\n")
    );
  }

  return lines.join("\n");
}
