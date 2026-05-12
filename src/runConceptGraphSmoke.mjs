import { buildConceptContext } from "./hegelConceptGraph.mjs";
import { buildDialecticalPlan } from "./hegelDialectic.mjs";
import { auditHegelReply } from "./hegelSelfAudit.mjs";

const cases = [
  {
    id: "freedom_arbitrariness",
    prompt: "\u81ea\u7531\u662f\u4e0d\u662f\u60f3\u505a\u4ec0\u4e48\u5c31\u505a\u4ec0\u4e48\uff1f",
    expectedConcepts: ["freedom", "will"],
    expectedDistinctions: [["freedom", "arbitrariness"]],
    badReply: "\u81ea\u7531\u5c31\u662f\u60f3\u505a\u4ec0\u4e48\u5c31\u505a\u4ec0\u4e48\u3002",
    expectedAuditCodes: ["freedom_misreading"]
  },
  {
    id: "actuality_status_quo",
    prompt: "\u51e1\u662f\u73b0\u5b9e\u7684\u90fd\u662f\u5408\u7406\u7684\uff0c\u8fd9\u662f\u4e0d\u662f\u7ed9\u73b0\u72b6\u8fa9\u62a4\uff1f",
    expectedConcepts: ["actuality", "rationality"],
    expectedDistinctions: [["actuality", "mere existence"], ["actuality", "status quo"]],
    badReply: "\u51e1\u662f\u5b58\u5728\u7684\u4e00\u5207\u73b0\u5b9e\u90fd\u662f\u6b63\u5f53\u7684\u3002",
    expectedAuditCodes: ["actuality_misreading"]
  },
  {
    id: "civil_society_state",
    prompt: "\u5982\u4f55\u533a\u5206\u5e02\u6c11\u793e\u4f1a\u3001\u56fd\u5bb6\u4e0e\u4f26\u7406\u751f\u6d3b\uff1f",
    expectedConcepts: ["civil_society", "state", "ethical_life"],
    expectedDistinctions: [["civil_society", "state"], ["state", "civil_society"]],
    badReply: "\u5e02\u6c11\u793e\u4f1a\u548c\u56fd\u5bb6\u53ea\u662f\u540c\u4e00\u4e2a\u4e1c\u897f\u7684\u4e24\u4e2a\u540d\u5b57\u3002",
    expectedAuditCodes: ["required_distinction_missing"]
  },
  {
    id: "sublation_cancellation",
    prompt: "\u626c\u5f03\u662f\u4e0d\u662f\u5355\u7eaf\u53d6\u6d88\uff1f",
    expectedConcepts: ["sublation", "negation", "mediation"],
    expectedDistinctions: [["sublation", "simple cancellation"]],
    badReply: "\u626c\u5f03\u5c31\u662f\u53d6\u6d88\u548c\u5426\u5b9a\u3002",
    expectedAuditCodes: ["sublation_misreading"]
  },
  {
    id: "master_slave_class_struggle",
    prompt: "\u4e3b\u5974\u8fa9\u8bc1\u6cd5\u662f\u4e0d\u662f\u9636\u7ea7\u6597\u4e89\uff1f",
    expectedConcepts: ["master_slave", "recognition"],
    expectedDistinctions: [["master_slave", "class struggle"]],
    badReply: "\u4e3b\u5974\u8fa9\u8bc1\u6cd5\u5c31\u662f\u9636\u7ea7\u6597\u4e89\u3002",
    expectedAuditCodes: ["master_slave_misreading"]
  }
];

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function ids(items = []) {
  return items.map((item) => item?.id).filter(Boolean);
}

function hasDistinction(plan, [concept, target]) {
  return (plan.required_distinctions || []).some(
    (item) => item.concept === concept && item.distinguish_from === target
  );
}

function sourceAnchorComplete(plan, concept) {
  const requirement = (plan.source_anchor_requirements || []).find(
    (item) => item.concept === concept
  );
  return Boolean(
    requirement &&
      requirement.required_source_families?.length &&
      requirement.source_queries?.length
  );
}

const results = [];

for (const testCase of cases) {
  const conceptContext = buildConceptContext(testCase.prompt);
  const plan = buildDialecticalPlan({
    userMessage: testCase.prompt,
    detectedConcepts: conceptContext.detected_concepts,
    conceptContext,
    corpusHits: []
  });
  const detectedIds = ids(conceptContext.detected_concepts);
  const audit = auditHegelReply({
    reply: testCase.badReply,
    userMessage: testCase.prompt,
    conceptContext,
    dialecticalPlan: plan
  });
  const auditCodes = audit.warnings.map((item) => item.code);

  for (const concept of testCase.expectedConcepts) {
    assert(detectedIds.includes(concept), `${testCase.id}: missing detected concept ${concept}`, {
      detectedIds
    });
    assert(sourceAnchorComplete(plan, concept), `${testCase.id}: incomplete source anchor for ${concept}`, {
      source_anchor_requirements: plan.source_anchor_requirements
    });
  }

  for (const pair of testCase.expectedDistinctions) {
    assert(hasDistinction(plan, pair), `${testCase.id}: missing required distinction ${pair.join(" vs ")}`, {
      required_distinctions: plan.required_distinctions
    });
  }

  for (const code of testCase.expectedAuditCodes) {
    assert(auditCodes.includes(code), `${testCase.id}: missing audit code ${code}`, {
      auditCodes,
      audit
    });
  }

  results.push({
    id: testCase.id,
    detected: testCase.expectedConcepts,
    distinctions: testCase.expectedDistinctions.map(([concept, target]) => `${concept} vs ${target}`),
    auditCodes: testCase.expectedAuditCodes
  });
}

console.log(JSON.stringify({ ok: true, cases: results.length, results }, null, 2));
