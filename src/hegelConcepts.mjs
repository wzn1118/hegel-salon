import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chineseCorpusDir } from "./projectPaths.mjs";

const conceptLedgerPath = join(chineseCorpusDir, "concept-ledger.json");

let conceptLedgerCache = null;

function normalizeArray(values) {
  return Array.isArray(values) ? values.filter(Boolean).map(String) : [];
}

function normalizeConcept(concept) {
  return {
    conceptId: String(concept?.conceptId || ""),
    de: normalizeArray(concept?.de),
    en: normalizeArray(concept?.en),
    zhByEdition: Object.fromEntries(
      Object.entries(concept?.zhByEdition || {}).map(([key, values]) => [
        key,
        normalizeArray(values)
      ])
    ),
    relatedConcepts: normalizeArray(concept?.relatedConcepts),
    autoExpand: Boolean(concept?.autoExpand),
    onlyWhenExplicit: normalizeArray(concept?.onlyWhenExplicit),
    workSectionHints: Object.fromEntries(
      Object.entries(concept?.workSectionHints || {}).map(([workId, values]) => [
        workId,
        normalizeArray(values)
      ])
    ),
    notes: String(concept?.notes || "")
  };
}

function normalizeLedger(raw) {
  return {
    generatedAt: String(raw?.generatedAt || ""),
    termProfiles: (Array.isArray(raw?.termProfiles) ? raw.termProfiles : []).map((profile) => ({
      id: String(profile?.id || ""),
      label: String(profile?.label || ""),
      notes: String(profile?.notes || "")
    })),
    workEditionPrecedence: Object.fromEntries(
      Object.entries(raw?.workEditionPrecedence || {}).map(([workId, values]) => [
        workId,
        normalizeArray(values)
      ])
    ),
    generatedTermProfileByFamily: Object.fromEntries(
      Object.entries(raw?.generatedTermProfileByFamily || {}).map(([family, value]) => [
        family,
        String(value || "")
      ])
    ),
    concepts: (Array.isArray(raw?.concepts) ? raw.concepts : []).map(normalizeConcept)
  };
}

export async function loadHegelConceptLedger() {
  if (conceptLedgerCache) {
    return conceptLedgerCache;
  }

  if (!existsSync(conceptLedgerPath)) {
    conceptLedgerCache = normalizeLedger({});
    return conceptLedgerCache;
  }

  try {
    conceptLedgerCache = normalizeLedger(
      JSON.parse(await readFile(conceptLedgerPath, "utf8"))
    );
  } catch {
    conceptLedgerCache = normalizeLedger({});
  }

  return conceptLedgerCache;
}

export function isSuppressedMention(text, index) {
  const prefix = String(text || "").slice(Math.max(0, index - 12), index);
  return /不要|别|勿|不该|不必|无需|不用|避免|不要再|别再/u.test(prefix);
}

export function hasUnsuppressedPattern(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);

  for (const match of String(text || "").matchAll(regex)) {
    if (!isSuppressedMention(text, match.index ?? 0)) {
      return true;
    }
  }

  return false;
}

function collectConceptTerms(concept, termProfileId, mode = "all") {
  const terms = [];
  const push = (value) => {
    const next = String(value || "").trim();
    if (!next || terms.includes(next)) {
      return;
    }
    terms.push(next);
  };

  if (mode !== "zh-only") {
    concept.de.forEach(push);
    concept.en.forEach(push);
  }

  if (mode !== "western-only") {
    const preferredZh = normalizeArray(concept.zhByEdition?.[termProfileId]);
    if (preferredZh.length) {
      preferredZh.forEach(push);
    } else {
      Object.values(concept.zhByEdition || {}).forEach((values) =>
        normalizeArray(values).forEach(push)
      );
    }
  }

  return terms;
}

function findExplicitTerms(prompt, concept) {
  const lowered = String(prompt || "").toLowerCase();
  const matchedTerms = [];
  const seen = new Set();

  function add(term) {
    const value = String(term || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) {
      return;
    }
    seen.add(key);
    matchedTerms.push(value);
  }

  for (const term of [...concept.de, ...concept.en]) {
    const value = String(term || "").trim();
    if (!value) continue;
    const index = lowered.indexOf(value.toLowerCase());
    if (index >= 0 && !isSuppressedMention(prompt, index)) {
      add(value);
    }
  }

  for (const values of Object.values(concept.zhByEdition || {})) {
    for (const term of normalizeArray(values)) {
      const index = String(prompt || "").indexOf(term);
      if (index >= 0 && !isSuppressedMention(prompt, index)) {
        add(term);
      }
    }
  }

  return matchedTerms;
}

function findSuppressedTerms(prompt, concept) {
  const lowered = String(prompt || "").toLowerCase();
  const suppressed = [];
  const seen = new Set();

  function add(term) {
    const value = String(term || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) {
      return;
    }
    seen.add(key);
    suppressed.push(value);
  }

  for (const term of [...concept.de, ...concept.en]) {
    const value = String(term || "").trim();
    if (!value) continue;
    const index = lowered.indexOf(value.toLowerCase());
    if (index >= 0 && isSuppressedMention(prompt, index)) {
      add(value);
    }
  }

  for (const values of Object.values(concept.zhByEdition || {})) {
    for (const term of normalizeArray(values)) {
      const index = String(prompt || "").indexOf(term);
      if (index >= 0 && isSuppressedMention(prompt, index)) {
        add(term);
      }
    }
  }

  return suppressed;
}

export function buildConceptPlan(userPrompt, families = [], ledger) {
  const prompt = String(userPrompt || "");
  const effectiveLedger = ledger || {
    concepts: [],
    termProfiles: [],
    workEditionPrecedence: {},
    generatedTermProfileByFamily: {}
  };
  const explicit = [];
  const suppressed = [];

  for (const concept of effectiveLedger.concepts || []) {
    const explicitTerms = findExplicitTerms(prompt, concept);
    if (explicitTerms.length) {
      explicit.push({
        conceptId: concept.conceptId,
        matchedTerms: explicitTerms,
        relatedConcepts: concept.relatedConcepts,
        autoExpand: concept.autoExpand,
        onlyWhenExplicit: concept.onlyWhenExplicit
      });
      continue;
    }

    const suppressedTerms = findSuppressedTerms(prompt, concept);
    if (suppressedTerms.length) {
      suppressed.push({
        conceptId: concept.conceptId,
        matchedTerms: suppressedTerms
      });
    }
  }

  return {
    prompt,
    families: Array.isArray(families) ? [...families] : [],
    conceptTargets: explicit,
    suppressedConcepts: suppressed,
    explicitComparison:
      /比较|对照|不同版本|别的版本|另一版本|另一种译法|攻击|反驳|批评/u.test(prompt)
  };
}

export function getTermProfile(termProfileId, ledger) {
  return (ledger?.termProfiles || []).find(
    (profile) => profile.id === String(termProfileId || "")
  ) || null;
}

export function resolveConceptTerms(
  conceptId,
  termProfileId,
  ledger,
  mode = "all"
) {
  const concept = (ledger?.concepts || []).find(
    (entry) => entry.conceptId === String(conceptId || "")
  );
  if (!concept) {
    return [];
  }
  return collectConceptTerms(concept, termProfileId, mode);
}

export function getConceptById(conceptId, ledger) {
  return (ledger?.concepts || []).find(
    (entry) => entry.conceptId === String(conceptId || "")
  ) || null;
}

export function resolveConceptSections(conceptPlan, workId, ledger) {
  const sections = [];
  const seen = new Set();

  function add(section) {
    const value = String(section || "").trim().toLowerCase();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    sections.push(value);
  }

  for (const target of conceptPlan?.conceptTargets || []) {
    const concept = getConceptById(target.conceptId, ledger);
    if (!concept) {
      continue;
    }

    const values = concept.workSectionHints?.[String(workId || "")] || [];
    values.forEach(add);
  }

  return sections;
}

export function scoreTextWithConceptPlan(
  text,
  conceptPlan,
  ledger,
  options = {}
) {
  const haystack = String(text || "");
  const lowered = haystack.toLowerCase();
  const mode = options.mode || "all";
  const termProfileId = options.termProfileId || "";
  let score = 0;

  for (const target of conceptPlan?.conceptTargets || []) {
    const concept = getConceptById(target.conceptId, ledger);
    if (!concept) {
      continue;
    }

    const terms = collectConceptTerms(concept, termProfileId, mode);
    for (const term of terms) {
      if (!term) continue;
      if (/[\u4e00-\u9fff]/u.test(term)) {
        if (haystack.includes(term)) {
          score += Math.max(8, term.length * 2);
        }
      } else if (lowered.includes(term.toLowerCase())) {
        score += Math.max(6, term.length);
      }
    }
  }

  return score;
}

export function defaultGeneratedTermProfile(family, ledger) {
  return (
    ledger?.generatedTermProfileByFamily?.[String(family || "")] ||
    "generated-default"
  );
}

export function precedenceForEdition(workId, editionId, ledger) {
  const list = ledger?.workEditionPrecedence?.[String(workId || "")] || [];
  const index = list.indexOf(String(editionId || ""));
  return index >= 0 ? index + 1 : Number.MAX_SAFE_INTEGER;
}
