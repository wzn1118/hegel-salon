import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "./projectPaths.mjs";

const graphPath = join(dataDir, "hegel", "concept_graph.json");

const requiredFields = [
  "zh",
  "de",
  "aliases",
  "core_definition",
  "primary_locations",
  "relations",
  "common_misreadings",
  "answer_rules",
  "forbidden_claims",
  "canonical_questions",
  "source_queries",
  "required_source_families",
  "dialectical_role",
  "misreading_tests",
  "modern_extension_rules"
];

const relationFields = ["requires", "distinguished_from", "develops_into"];
const allowedSharedAliases = new Map(
  [
    ["bildung", ["culture", "education"]],
    ["vernunft", ["rationality", "reason", "reason_consciousness"]],
    ["理性", ["rationality", "reason"]],
    ["world history", ["history", "world_history"]],
    ["世界历史", ["history", "world_history"]],
    ["weltgeschichte", ["history", "world_history"]]
  ].map(([alias, owners]) => [alias, new Set(owners)])
);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.filter(Boolean).length > 0;
}

function isAllowedSharedAlias(alias, firstOwner, secondOwner) {
  const owners = allowedSharedAliases.get(alias);
  return Boolean(owners?.has(firstOwner) && owners?.has(secondOwner));
}

function validateConcept(id, concept, conceptIds, aliasOwners, errors, warnings) {
  for (const field of requiredFields) {
    if (!(field in concept)) {
      errors.push(`${id}: missing required field ${field}`);
    }
  }

  for (const field of ["zh", "de", "core_definition", "domain", "dialectical_role"]) {
    if (!isNonEmptyString(concept[field])) {
      errors.push(`${id}: ${field} must be a non-empty string`);
    }
  }

  for (const field of [
    "aliases",
    "primary_locations",
    "common_misreadings",
    "answer_rules",
    "forbidden_claims",
    "canonical_questions",
    "source_queries",
    "required_source_families",
    "misreading_tests",
    "modern_extension_rules"
  ]) {
    if (!isNonEmptyArray(concept[field])) {
      errors.push(`${id}: ${field} must be a non-empty array`);
    }
  }

  for (const alias of concept.aliases || []) {
    const normalized = String(alias || "").trim().toLowerCase();
    if (!normalized || normalized.length < 2) continue;
    const owner = aliasOwners.get(normalized);
    if (owner && owner !== id && !isAllowedSharedAlias(normalized, owner, id)) {
      warnings.push(`${id}: alias "${alias}" also appears on ${owner}`);
    } else {
      aliasOwners.set(normalized, id);
    }
  }

  for (const relationField of relationFields) {
    const relations = concept.relations?.[relationField];
    if (!Array.isArray(relations)) {
      errors.push(`${id}: relations.${relationField} must be an array`);
      continue;
    }

    for (const target of relations) {
      if (relationField !== "distinguished_from" && !conceptIds.has(target)) {
        warnings.push(`${id}: relations.${relationField} points to non-graph target "${target}"`);
      }
    }
  }

  const hasMisreadingRule =
    isNonEmptyArray(concept.common_misreadings) &&
    isNonEmptyArray(concept.misreading_tests) &&
    isNonEmptyArray(concept.forbidden_claims);
  if (!hasMisreadingRule) {
    errors.push(`${id}: misreading/forbidden rule coverage is incomplete`);
  }
}

async function main() {
  const graph = JSON.parse(await readFile(graphPath, "utf8"));
  const concepts = graph.concepts || {};
  const conceptIds = new Set(Object.keys(concepts));
  const minimum = Number(graph.v2_contract?.minimum_concepts || 80);
  const errors = [];
  const warnings = [];
  const aliasOwners = new Map();

  if (Number(graph.schema_version || 0) < 2) {
    errors.push("schema_version must be at least 2");
  }

  if (conceptIds.size < minimum) {
    errors.push(`concept count ${conceptIds.size} is below required minimum ${minimum}`);
  }

  for (const [id, concept] of Object.entries(concepts)) {
    validateConcept(id, concept || {}, conceptIds, aliasOwners, errors, warnings);
  }

  const domains = [...new Set(Object.values(concepts).map((concept) => concept.domain).filter(Boolean))];
  const summary = {
    ok: errors.length === 0,
    concepts: conceptIds.size,
    domains: domains.sort(),
    warnings: warnings.length,
    errors: errors.length
  };

  console.log(JSON.stringify(summary, null, 2));

  if (warnings.length) {
    console.warn("Warnings:");
    for (const item of warnings.slice(0, 80)) {
      console.warn(`- ${item}`);
    }
  }

  if (errors.length) {
    console.error("Errors:");
    for (const item of errors) {
      console.error(`- ${item}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
