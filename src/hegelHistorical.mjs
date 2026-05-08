import { buildConceptPlan } from "./hegelConcepts.mjs";
import { searchHegelCorpus } from "./hegelCorpus.mjs";

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compressPassage(text, maxLength = 700) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}...`;
}

function inferLocator(hit) {
  const pageTitle = String(hit?.pageTitle || "");
  const content = String(hit?.content || "");
  const sectionMatch =
    pageTitle.match(/搂\s*\d+[a-z]?/i) ||
    content.match(/搂\s*\d+[a-z]?/i) ||
    pageTitle.match(/chapter\s+[ivxlcdm0-9]+/i) ||
    pageTitle.match(/introduction|preface|remark|addition/i);

  return sectionMatch ? sectionMatch[0] : pageTitle || "unknown locator";
}

function historyFamilyFromHit(hit) {
  const workId = String(hit?.workId || "");
  const title = String(hit?.workTitle || "");

  if (workId === "philosophy-of-history" || /world history/i.test(title)) {
    return "philosophy-of-history";
  }

  if (
    workId === "history-of-philosophy" ||
    /history of philosophy/i.test(title)
  ) {
    return "history-of-philosophy";
  }

  if (workId === "philosophy-of-right" || /philosophy of right/i.test(title)) {
    return "philosophy-of-right";
  }

  if (
    ["objective-spirit", "subjective-spirit", "encyclopaedia"].includes(workId) ||
    /objective spirit|subjective spirit|encyclopaedia/i.test(title)
  ) {
    return "spirit";
  }

  if (
    /early|theological|german constitution|natural law|ethical life/i.test(title) ||
    [
      "system-of-ethical-life",
      "natural-law",
      "german-constitution",
      "early-theological-writings",
      "fate-and-christianity"
    ].includes(workId)
  ) {
    return "early";
  }

  return "other";
}

function hitPriority(hit) {
  const family = historyFamilyFromHit(hit);
  switch (family) {
    case "philosophy-of-history":
      return 6;
    case "philosophy-of-right":
      return 5;
    case "spirit":
      return 4;
    case "history-of-philosophy":
      return 3;
    case "early":
      return 2;
    default:
      return 1;
  }
}

function isContemporaryRealityQuery(prompt) {
  const text = String(prompt || "");
  return (
    /现实|当代|今天|现在|当前|现代|现时代|局势|格局|政治|治理|国家能力|官僚|舆论|媒体|技术|资本|平台|民族|战争|帝国|美国|中国|欧洲|俄国|俄罗斯|乌克兰|中东|日本|韩国|台湾/u.test(
      text
    ) ||
    /领导人|执政者|当权者|最高决断者|民选领袖|中心人物|寡头|平台资本/u.test(text) ||
    /contemporary|current|today|modern|politics|state capacity|bureaucracy|public opinion|media|technology|capitalism|war|empire/i.test(
      text
    )
  );
}

function buildHistoricalBridgeQuery(userPrompt) {
  return [
    String(userPrompt || ""),
    "历史 世界历史 国家 市民社会 官僚 公众意见 统治 政府 战争 革命 伦理生活 自由 普遍性 现实性",
    "world history state civil society bureaucracy public opinion government war revolution ethical life freedom actuality universality"
  ].join("\n");
}

function dedupeHits(hits) {
  const seen = new Set();
  const output = [];

  for (const hit of hits || []) {
    const key = `${hit?.workId || ""}::${hit?.url || ""}::${hit?.pageTitle || ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(hit);
  }

  return output;
}

function selectHistoricalHits(results) {
  const sorted = dedupeHits(results).sort((left, right) => {
    const priorityGap = hitPriority(right) - hitPriority(left);
    if (priorityGap !== 0) {
      return priorityGap;
    }
    return Number(right?.score || 0) - Number(left?.score || 0);
  });

  const selected = [];
  const seenFamilies = new Set();

  for (const hit of sorted) {
    const family = historyFamilyFromHit(hit);
    if (!seenFamilies.has(family) || selected.length < 4) {
      selected.push(hit);
      seenFamilies.add(family);
    }
    if (selected.length >= 4) {
      break;
    }
  }

  return selected;
}

function familyUseLabel(hit) {
  switch (historyFamilyFromHit(hit)) {
    case "philosophy-of-history":
      return "Use this to determine the historical form and direction of the present object.";
    case "philosophy-of-right":
      return "Use this to determine the institutional shape, legitimacy, and limits of political order.";
    case "spirit":
      return "Use this to determine the social medium through which a present contradiction becomes objective.";
    case "history-of-philosophy":
      return "Use this to determine the spiritual type or conceptual posture at stake.";
    case "early":
      return "Use this to illuminate the genesis of the contradiction before the mature system.";
    default:
      return "Use this as a supporting historical witness rather than as decorative background.";
  }
}

export async function buildHistoricalReferenceContext(
  userPrompt,
  baseResults = [],
  conceptPlan,
  conceptLedger
) {
  if (!isContemporaryRealityQuery(userPrompt)) {
    return {
      enabled: false,
      entries: [],
      contextText: "Historical reference module inactive for this query."
    };
  }

  const historyFamilies = [
    ...(Array.isArray(conceptPlan?.families) ? conceptPlan.families : []),
    "philosophy-of-history",
    "philosophy-of-right",
    "encyclopaedia-spirit",
    "history-of-philosophy"
  ];
  const historicalPlan = buildConceptPlan(
    buildHistoricalBridgeQuery(userPrompt),
    [...new Set(historyFamilies)],
    conceptLedger
  );

  const { results } = await searchHegelCorpus(
    buildHistoricalBridgeQuery(userPrompt),
    12,
    historicalPlan,
    conceptLedger
  );

  const selected = selectHistoricalHits([...(baseResults || []), ...(results || [])]);
  if (!selected.length) {
    return {
      enabled: true,
      entries: [],
      contextText: [
        "Historical reference module active.",
        "No stable historical witness was recovered. Do not fake historical parallels."
      ].join("\n")
    };
  }

  const lines = [
    "Historical reference module active.",
    "For a present-day or reality-oriented query, do not stay at the level of commentary.",
    "Determine the present object through historical form, institutional medium, development, and contradiction.",
    "Use the following historical witnesses as working material, not as ornamental parallels."
  ];

  selected.forEach((hit, index) => {
    lines.push(
      [
        `Historical reference ${index + 1}`,
        `Work: ${hit.workTitle}`,
        `Locator: ${inferLocator(hit)}`,
        `Authority: ${hit.authority}`,
        `Historical use: ${familyUseLabel(hit)}`,
        `URL: ${hit.url}`,
        `Quoted passage: "${compressPassage(hit.content)}"`
      ].join("\n")
    );
  });

  lines.push(
    "When answering, explicitly distinguish:",
    "1. the present object itself,",
    "2. the historical form that illuminates it,",
    "3. the limit of the analogy."
  );

  return {
    enabled: true,
    entries: selected,
    contextText: lines.join("\n\n")
  };
}
