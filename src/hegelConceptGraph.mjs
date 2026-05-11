import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./projectPaths.mjs";

const graphPath = join(dataDir, "hegel", "concept_graph.json");
let graphCache = null;

const domainFallbackSourceFamilies = {
  logic: ["science-of-logic", "encyclopaedia-logic"],
  phenomenology: ["phenomenology"],
  right: ["philosophy-of-right"],
  spirit: ["encyclopaedia-spirit", "philosophy-of-right"],
  history: ["philosophy-of-history"],
  art: ["aesthetics"],
  religion: ["philosophy-of-religion"],
  philosophy_history: ["history-of-philosophy"],
  early: ["early-writings"],
  modern_extension: ["philosophy-of-right", "encyclopaedia-spirit"]
};

const triggerRules = [
  {
    pattern: /想干什么就干什么|想做什么就做什么|任性|随心所欲|arbitrariness|caprice|license/i,
    concepts: ["freedom", "will"],
    warning: "The prompt risks equating freedom with arbitrary choice; distinguish Freiheit from Willkuer/license."
  },
  {
    pattern: /凡是现实的都是合理的|现实.*合理|合理.*现实|现实.*辩护|为现实辩护|status quo|apolog/i,
    concepts: ["actuality", "rationality", "reason"],
    warning: "The prompt risks reading Wirklichkeit as mere existence or status-quo apology."
  },
  {
    pattern: /主奴|主人.*奴隶|奴隶.*主人|lordship|bondage|master.?slave|class struggle|阶级斗争/i,
    concepts: ["master_slave", "recognition"],
    warning: "The prompt risks reducing lordship and bondage to later class-struggle theory without mediation."
  },
  {
    pattern: /扬弃|aufhebung|sublation|简单否定|否定掉|取消|cancel/i,
    concepts: ["sublation", "negation", "mediation"],
    warning: "The prompt risks treating Aufhebung as simple cancellation rather than cancel-preserve-raise."
  },
  {
    pattern: /国家.*压迫|压迫.*国家|state.*oppress|obedience|专制|威权/i,
    concepts: ["state", "ethical_life", "freedom"],
    warning: "The prompt risks treating the state as mere coercion or treating every empirical state as rational."
  },
  {
    pattern: /市民社会|civil society|bürgerliche|buergerliche|市场|market/i,
    concepts: ["civil_society", "state", "ethical_life"],
    warning: "The prompt should distinguish civil society from the state and from full ethical freedom."
  },
  {
    pattern: /AI|人工智能|算法|社交媒体|平台|互联网|modern|现代|当代/i,
    concepts: ["spirit", "objective_spirit", "history", "freedom", "ai"],
    warning: "The prompt asks for modern extension; separate Hegelian doctrine from contemporary extrapolation."
  },
  {
    pattern: /这句话|是不是.*说的|quote|quotation|citation|原话|引文|出处/i,
    concepts: ["philosophy"],
    warning: "The prompt asks for citation discipline; do not treat conceptual paraphrase as checked wording."
  },
  {
    pattern: /批评|反驳|critique|criticize|反对/i,
    concepts: ["negation", "contradiction", "mediation"],
    warning: "The prompt asks for critique; negation must be determinate, not merely oppositional rhetoric."
  },
  {
    pattern: /想干什么就干什么|想做什么就做什么|任性|随心所欲|arbitrariness|caprice|license/i,
    concepts: ["freedom", "will"],
    warning: "The prompt risks equating freedom with arbitrary choice; distinguish Freiheit from Willkuer/license."
  },
  {
    pattern: /凡是现实的都是合理|现实.*合理|合理.*现实|status quo|apolog/i,
    concepts: ["actuality", "rationality", "reason"],
    warning: "The prompt risks reading Wirklichkeit as mere existence or status-quo apology."
  },
  {
    pattern: /主奴|主人.*奴隶|奴隶.*主人|lordship|bondage|master.?slave|class struggle|阶级斗争/i,
    concepts: ["master_slave", "recognition"],
    warning: "The prompt risks reducing lordship and bondage to later class-struggle theory without mediation."
  },
  {
    pattern: /扬弃|aufhebung|sublation|简单否定|否定掉|cancel/i,
    concepts: ["sublation", "negation", "mediation"],
    warning: "The prompt risks treating Aufhebung as simple cancellation rather than cancel-preserve-raise."
  },
  {
    pattern: /国家.*压迫|压迫.*国家|state.*oppress|obedience|专制|威权/i,
    concepts: ["state", "ethical_life", "freedom"],
    warning: "The prompt risks treating the state as mere coercion or treating every empirical state as rational."
  },
  {
    pattern: /市民社会|civil society|bürgerliche|buergerliche|市场|market/i,
    concepts: ["civil_society", "state", "ethical_life"],
    warning: "The prompt should distinguish civil society from the state and from full ethical freedom."
  },
  {
    pattern: /AI|人工智能|算法|社交媒体|平台|互联网|modern|现代|当代/i,
    concepts: ["spirit", "objective_spirit", "history", "freedom"],
    warning: "The prompt asks for modern extension; separate Hegelian doctrine from contemporary extrapolation."
  },
  {
    pattern: /这句话|是不是.*说的|quote|quotation|citation|原话|引文|出处/i,
    concepts: ["philosophy"],
    warning: "The prompt asks for citation discipline; do not treat conceptual paraphrase as checked wording."
  },
  {
    pattern: /批评|反驳|critique|criticize|反对/i,
    concepts: ["negation", "contradiction", "mediation"],
    warning: "The prompt asks for critique; negation must be determinate, not merely oppositional rhetoric."
  }
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_/|]+/g, " ")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArray(values) {
  return Array.isArray(values) ? values.filter(Boolean).map(String) : [];
}

function normalizeConcept(id, raw = {}) {
  const aliases = [
    id,
    id.replace(/_/g, " "),
    raw.zh,
    raw.de,
    ...normalizeArray(raw.aliases)
  ].filter(Boolean);
  const domain = String(raw.domain || inferDomainFromLocations(raw.primary_locations)).trim() || "logic";

  return {
    id,
    zh: String(raw.zh || ""),
    de: String(raw.de || ""),
    aliases: [...new Set(aliases.map(String))],
    core_definition: String(raw.core_definition || ""),
    primary_locations: normalizeArray(raw.primary_locations),
    relations: {
      requires: normalizeArray(raw.relations?.requires),
      distinguished_from: normalizeArray(raw.relations?.distinguished_from),
      develops_into: normalizeArray(raw.relations?.develops_into)
    },
    common_misreadings: normalizeArray(raw.common_misreadings),
    answer_rules: normalizeArray(raw.answer_rules),
    forbidden_claims: normalizeArray(raw.forbidden_claims),
    domain,
    canonical_questions: normalizeArray(raw.canonical_questions),
    source_queries: normalizeArray(raw.source_queries),
    required_source_families: normalizeArray(raw.required_source_families).length
      ? normalizeArray(raw.required_source_families)
      : domainFallbackSourceFamilies[domain] || ["science-of-logic"],
    dialectical_role: String(raw.dialectical_role || ""),
    misreading_tests: normalizeArray(raw.misreading_tests),
    modern_extension_rules: normalizeArray(raw.modern_extension_rules)
  };
}

function inferDomainFromLocations(locations = []) {
  const text = normalizeArray(locations).join(" ").toLowerCase();
  if (/phenomenology/.test(text)) return "phenomenology";
  if (/philosophy of right|right/.test(text)) return "right";
  if (/history of philosophy/.test(text)) return "philosophy_history";
  if (/history|world history/.test(text)) return "history";
  if (/aesthetic|art/.test(text)) return "art";
  if (/religion/.test(text)) return "religion";
  if (/spirit|encyclopaedia/.test(text)) return "spirit";
  return "logic";
}

function normalizeGraph(raw = {}) {
  const concepts = Object.fromEntries(
    Object.entries(raw.concepts || {}).map(([id, concept]) => [
      id,
      normalizeConcept(id, concept)
    ])
  );

  return {
    schema_version: Number(raw.schema_version || 1),
    generated_at: String(raw.generated_at || ""),
    description: String(raw.description || ""),
    concepts
  };
}

function aliasMatchScore(message, alias) {
  const rawMessage = String(message || "");
  const rawAlias = String(alias || "").trim();
  if (!rawAlias) return 0;

  if (/[\u4e00-\u9fff]/u.test(rawAlias)) {
    if (rawMessage.includes(rawAlias)) {
      return rawAlias.length >= 4 ? 4 : 3;
    }
    return 0;
  }

  const normalizedMessage = ` ${normalizeText(rawMessage)} `;
  const normalizedAlias = normalizeText(rawAlias);
  if (!normalizedAlias) return 0;

  if (normalizedAlias.includes(" ")) {
    return normalizedMessage.includes(` ${normalizedAlias} `) ? 4 : 0;
  }

  const boundary = new RegExp(`(^|\\s)${escapeRegExp(normalizedAlias)}($|\\s)`, "i");
  return boundary.test(normalizedMessage) ? 3 : 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}

function sortDetections(items) {
  return [...items].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.risk_score !== left.risk_score) return right.risk_score - left.risk_score;
    return left.id.localeCompare(right.id);
  });
}

function riskLevelFromScore(score) {
  if (score >= 8) return "high";
  if (score >= 4) return "medium";
  return score > 0 ? "low" : "none";
}

function mergeScore(current, next) {
  return Math.max(Number(current || 0), Number(next || 0));
}

export function loadConceptGraph() {
  if (graphCache) {
    return graphCache;
  }

  if (!existsSync(graphPath)) {
    graphCache = normalizeGraph({});
    return graphCache;
  }

  graphCache = normalizeGraph(JSON.parse(readFileSync(graphPath, "utf8")));
  return graphCache;
}

export function detectConcepts(userMessage) {
  const graph = loadConceptGraph();
  const detections = new Map();
  const triggerWarnings = [];

  function addDetection(id, patch = {}) {
    const concept = graph.concepts[id];
    if (!concept) return;

    const existing = detections.get(id) || {
      id,
      zh: concept.zh,
      de: concept.de,
      score: 0,
      risk_score: 0,
      domain: concept.domain,
      matched_aliases: [],
      matched_triggers: [],
      matched_misreading_tests: [],
      inferred: false
    };

    detections.set(id, {
      ...existing,
      score: mergeScore(existing.score, patch.score),
      risk_score: mergeScore(existing.risk_score, patch.risk_score),
      matched_aliases: unique([
        ...existing.matched_aliases,
        ...normalizeArray(patch.matched_aliases)
      ]),
      matched_triggers: unique([
        ...existing.matched_triggers,
        ...normalizeArray(patch.matched_triggers)
      ]),
      matched_misreading_tests: unique([
        ...existing.matched_misreading_tests,
        ...normalizeArray(patch.matched_misreading_tests)
      ]),
      inferred: Boolean(existing.inferred || patch.inferred)
    });
  }

  for (const [id, concept] of Object.entries(graph.concepts)) {
    for (const alias of concept.aliases) {
      const score = aliasMatchScore(userMessage, alias);
      if (score > 0) {
        addDetection(id, {
          score,
          matched_aliases: [alias]
        });
      }
    }

    for (const test of concept.misreading_tests) {
      const score = aliasMatchScore(userMessage, test);
      if (score > 0) {
        addDetection(id, {
          score: Math.max(3, score),
          risk_score: Math.max(3, score),
          matched_misreading_tests: [test],
          inferred: true
        });
      }
    }
  }

  for (const rule of triggerRules) {
    if (!rule.pattern.test(String(userMessage || ""))) {
      continue;
    }

    triggerWarnings.push(rule.warning);
    for (const id of rule.concepts) {
      addDetection(id, {
        score: 5,
        risk_score: 5,
        matched_triggers: [rule.pattern.source],
        inferred: true
      });
    }
  }

  const explicitIds = new Set(detections.keys());
  for (const id of explicitIds) {
    const concept = graph.concepts[id];
    const related = [
      ...concept.relations.requires,
      ...concept.relations.develops_into
    ];
    for (const relatedId of related) {
      if (graph.concepts[relatedId] && !detections.has(relatedId)) {
        addDetection(relatedId, {
          score: 1,
          risk_score: 1,
          inferred: true,
          matched_triggers: [`relation:${id}`]
        });
      }
    }
  }

  return sortDetections([...detections.values()]).map((item) => ({
    ...item,
    risk_level: riskLevelFromScore(item.risk_score),
    trigger_warnings: triggerWarnings
  }));
}

export function getRelatedConcepts(concept) {
  const graph = loadConceptGraph();
  const id = typeof concept === "string" ? concept : concept?.id;
  const entry = graph.concepts[id];
  if (!entry) return [];

  const ids = unique([
    ...entry.relations.requires,
    ...entry.relations.distinguished_from,
    ...entry.relations.develops_into
  ]);

  return ids.map((relatedId) => {
    const related = graph.concepts[relatedId];
    return related
      ? {
          id: relatedId,
          zh: related.zh,
          de: related.de,
          relation: entry.relations.requires.includes(relatedId)
            ? "requires"
            : entry.relations.develops_into.includes(relatedId)
            ? "develops_into"
            : "distinguished_from"
        }
      : {
          id: relatedId,
          zh: "",
          de: "",
          relation: "distinguished_from"
        };
  });
}

export function getConceptBundle(concepts) {
  const graph = loadConceptGraph();
  const ids = unique(
    (Array.isArray(concepts) ? concepts : [])
      .map((item) => (typeof item === "string" ? item : item?.id))
      .filter((id) => graph.concepts[id])
  );

  return ids.map((id) => {
    const concept = graph.concepts[id];
    return {
      ...concept,
      related: getRelatedConcepts(id)
    };
  });
}

export function getMisreadingWarnings(concepts) {
  const graph = loadConceptGraph();
  const seen = new Set();
  const warnings = [];

  for (const item of Array.isArray(concepts) ? concepts : []) {
    const id = typeof item === "string" ? item : item?.id;
    const concept = graph.concepts[id];
    if (!concept) continue;

    for (const warning of concept.common_misreadings) {
      const key = `${id}:${warning}`;
      if (!seen.has(key)) {
        seen.add(key);
        warnings.push({
          concept: id,
          zh: concept.zh,
          warning
        });
      }
    }

    for (const triggerWarning of item?.trigger_warnings || []) {
      const key = `trigger:${triggerWarning}`;
      if (!seen.has(key)) {
        seen.add(key);
        warnings.push({
          concept: id,
          zh: concept.zh,
          warning: triggerWarning
        });
      }
    }
  }

  return warnings;
}

export function buildConceptContext(userMessage) {
  const detectedConcepts = detectConcepts(userMessage);
  const topConcepts = detectedConcepts.slice(0, 12);
  const bundle = getConceptBundle(topConcepts);
  const warnings = getMisreadingWarnings(topConcepts);
  const recommended_locations = unique(
    bundle.flatMap((concept) => concept.primary_locations)
  );
  const concept_domains = unique(bundle.map((concept) => concept.domain));
  const source_anchor_queries = unique(
    bundle.flatMap((concept) => [
      ...concept.source_queries,
      ...concept.primary_locations,
      concept.zh,
      concept.de,
      concept.id?.replace(/_/g, " ")
    ])
  ).slice(0, 24);
  const coverage_requirements = bundle.map((concept) => ({
    concept: concept.id,
    domain: concept.domain,
    required_source_families: concept.required_source_families,
    source_queries: concept.source_queries.slice(0, 6),
    canonical_questions: concept.canonical_questions.slice(0, 4)
  }));
  const maxRisk = Math.max(0, ...topConcepts.map((item) => Number(item.risk_score || 0)));
  const risk_level =
    maxRisk >= 8 || warnings.length >= 8
      ? "high"
      : maxRisk >= 4 || warnings.length >= 3
      ? "medium"
      : warnings.length
      ? "low"
      : "none";
  const relation_edges = bundle.flatMap((concept) => [
    ...concept.relations.requires.map((target) => ({
      from: concept.id,
      to: target,
      type: "requires"
    })),
    ...concept.relations.develops_into.map((target) => ({
      from: concept.id,
      to: target,
      type: "develops_into"
    })),
    ...concept.relations.distinguished_from.map((target) => ({
      from: concept.id,
      to: target,
      type: "distinguished_from"
    }))
  ]);

  return {
    detected_concepts: topConcepts,
    concept_bundle: bundle,
    relation_edges,
    misreading_warnings: warnings,
    recommended_locations,
    concept_domains,
    source_anchor_queries,
    risk_level,
    coverage_requirements,
    contextText: renderConceptContext({
      detectedConcepts: topConcepts,
      bundle,
      warnings,
      recommended_locations,
      relation_edges,
      concept_domains,
      source_anchor_queries,
      risk_level,
      coverage_requirements
    })
  };
}

function renderConceptContext({
  detectedConcepts,
  bundle,
  warnings,
  recommended_locations,
  relation_edges,
  concept_domains,
  source_anchor_queries,
  risk_level,
  coverage_requirements
}) {
  const lines = [
    "This concept graph is a reasoning aid, not quotable primary evidence.",
    detectedConcepts.length
      ? `Detected concepts: ${detectedConcepts.map((item) => `${item.id} (${item.zh}/${item.de})`).join(", ")}`
      : "Detected concepts: none",
    recommended_locations.length
      ? `Recommended primary locations: ${recommended_locations.join("; ")}`
      : "Recommended primary locations: none",
    `Concept domains: ${concept_domains.length ? concept_domains.join(", ") : "none"}`,
    `Concept risk level: ${risk_level || "none"}`,
    source_anchor_queries.length
      ? `Source anchor queries: ${source_anchor_queries.slice(0, 12).join("; ")}`
      : "Source anchor queries: none"
  ];

  if (bundle.length) {
    lines.push("Concept determinations:");
    for (const concept of bundle) {
      lines.push(
        [
          `- ${concept.id} (${concept.zh}/${concept.de})`,
          `definition: ${concept.core_definition}`,
          `requires: ${concept.relations.requires.join(", ") || "none"}`,
          `distinguished_from: ${concept.relations.distinguished_from.join(", ") || "none"}`,
          `develops_into: ${concept.relations.develops_into.join(", ") || "none"}`,
          `source_families: ${concept.required_source_families.join(", ") || "none"}`,
          `dialectical_role: ${concept.dialectical_role || "none"}`,
          `answer_rules: ${concept.answer_rules.join(" | ") || "none"}`,
          `forbidden_claims: ${concept.forbidden_claims.join(" | ") || "none"}`
        ].join("\n")
      );
    }
  }

  if (relation_edges.length) {
    lines.push(
      `Relation edges: ${relation_edges
        .slice(0, 24)
        .map((edge) => `${edge.from} -${edge.type}-> ${edge.to}`)
        .join("; ")}`
    );
  }

  if (warnings.length) {
    lines.push("Misreading warnings:");
    for (const warning of warnings.slice(0, 12)) {
      lines.push(`- ${warning.concept}: ${warning.warning}`);
    }
  }

  if (coverage_requirements.length) {
    lines.push("Coverage requirements:");
    for (const item of coverage_requirements.slice(0, 8)) {
      lines.push(
        `- ${item.concept}: source families ${item.required_source_families.join(", ") || "none"}; questions ${item.canonical_questions.join(" | ") || "none"}`
      );
    }
  }

  return lines.join("\n");
}
