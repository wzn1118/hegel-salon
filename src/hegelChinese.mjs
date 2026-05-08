import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { chineseCorpusDir, corpusDir, projectRoot } from "./projectPaths.mjs";
import {
  loadHegelConceptLedger,
  buildConceptPlan,
  defaultGeneratedTermProfile,
  getTermProfile,
  precedenceForEdition,
  resolveConceptSections,
  resolveConceptTerms,
  scoreTextWithConceptPlan
} from "./hegelConcepts.mjs";

const root = projectRoot;
const chineseDir = chineseCorpusDir;
const textsDir = join(chineseDir, "texts");
const generatedTextsDir = join(chineseDir, "generated-texts");
const manifestPath = join(chineseDir, "manifest.json");
const generatedManifestPath = join(chineseDir, "generated-manifest.json");
const SECTION = "\u00a7";
const ENABLE_GENERATED_CHINESE = /^(1|true|yes)$/i.test(
  String(process.env.HEGEL_ENABLE_GENERATED_CHINESE || "")
);

const chineseSectionCache = new Map();
const generatedChineseSectionCache = new Map();

function inferWorkId(entry) {
  const explicit = String(entry?.workId || "").trim();
  if (explicit) {
    return explicit;
  }

  const families = Array.isArray(entry?.families) ? entry.families : [];
  const primary = String(families[0] || "").trim();
  return primary || "misc";
}

function inferTermProfileId(entry, kind) {
  const explicit = String(entry?.termProfileId || "").trim();
  if (explicit) {
    return explicit;
  }

  const fingerprint = [
    entry?.id || "",
    entry?.title || "",
    entry?.chineseTitle || "",
    entry?.translator || "",
    entry?.publisher || "",
    entry?.notes || ""
  ]
    .join(" ")
    .toLowerCase();

  if (/(xiangang|先刚)/i.test(fingerprint)) {
    return "xiangang-renmin";
  }

  if (/(helin|贺麟|王玖兴)/i.test(fingerprint)) {
    return "helin-shangwu";
  }

  if (/user-local-hegel-14|local-bundle|bundle split/i.test(fingerprint)) {
    return "local-bundle-classic";
  }

  if (kind === "generated") {
    return "generated-default";
  }

  if (kind === "entry" || kind === "localPdfSource") {
    return "bibliographic-only";
  }

  return "generated-default";
}

function inferQuoteStyle(entry, kind) {
  const explicit = String(entry?.quoteStyle || "").trim();
  if (explicit) {
    return explicit;
  }

  if (kind === "generated") {
    return "generated";
  }

  if (kind === "entry" || kind === "localPdfSource") {
    return "bibliographic";
  }

  const fingerprint = [entry?.id || "", entry?.title || "", entry?.notes || ""]
    .join(" ")
    .toLowerCase();

  if (/ocr/i.test(fingerprint)) {
    return "ocr-local";
  }

  return "checked-local";
}

function inferConceptCoverage(workId) {
  const map = {
    "philosophy-of-right": ["freiheit", "wille", "recht", "sittlichkeit", "gegenstand-objekt", "willkuer"],
    phenomenology: ["geist", "substanz", "subjekt", "begriff", "gegenstand-objekt"],
    "science-of-logic": ["begriff", "substanz", "subjekt"],
    "encyclopaedia-spirit": ["geist", "freiheit", "wille", "gegenstand-objekt"],
    "encyclopaedia-nature": ["gegenstand-objekt"],
    "history-of-philosophy": ["freiheit", "begriff", "geist"],
    "philosophy-of-history": ["freiheit", "geist"],
    "philosophy-of-religion": ["geist", "begriff", "substanz", "subjekt"],
    aesthetics: ["geist", "begriff"],
    "early-writings": ["geist", "freiheit", "wille"]
  };

  return map[String(workId || "")] || [];
}

function normalizeEditionEntry(entry, kind, ledger) {
  const workId = inferWorkId(entry);
  const editionId = String(entry?.editionId || entry?.id || "").trim() || workId;
  const quoteStyle = inferQuoteStyle(entry, kind);
  const explicitPrecedence = Number.parseInt(String(entry?.precedence ?? ""), 10);
  const fallbackPrecedence =
    quoteStyle === "checked-local"
      ? 1
      : quoteStyle === "ocr-local"
        ? 2
        : quoteStyle === "generated"
          ? 4
          : 5;
  const ledgerPrecedence = precedenceForEdition(workId, editionId, ledger);
  const precedence =
    Number.isFinite(explicitPrecedence) && explicitPrecedence > 0
      ? explicitPrecedence
      : ledgerPrecedence !== Number.MAX_SAFE_INTEGER
        ? ledgerPrecedence
        : fallbackPrecedence;

  return {
    ...entry,
    workId,
    editionId,
    editionLabel:
      String(entry?.editionLabel || entry?.title || entry?.chineseTitle || editionId).trim(),
    termProfileId: inferTermProfileId(entry, kind),
    precedence,
    quoteStyle,
    conceptCoverage: Array.isArray(entry?.conceptCoverage) && entry.conceptCoverage.length
      ? entry.conceptCoverage
      : inferConceptCoverage(workId)
  };
}

function normalizeChineseManifest(manifest, ledger) {
  return {
    ...manifest,
    entries: (manifest.entries || []).map((entry) =>
      normalizeEditionEntry(entry, "entry", ledger)
    ),
    localTexts: (manifest.localTexts || []).map((entry) =>
      normalizeEditionEntry(entry, "localText", ledger)
    ),
    localPdfSources: (manifest.localPdfSources || []).map((entry) =>
      normalizeEditionEntry(entry, "localPdfSource", ledger)
    )
  };
}

function normalizeWhitespace(text) {
  return String(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeSectionGlyphs(text) {
  return normalizeWhitespace(
    String(text)
      .replace(/&sect;/gi, SECTION)
      .replace(/\u6402/g, SECTION)
      .replace(/\u00a7\s+/g, `${SECTION} `)
      .replace(/\u00a7\./g, SECTION)
  );
}

function tidySectionText(text) {
  return normalizeSectionGlyphs(
    String(text)
      .replace(/^\s*\u00a7\s*/gim, `${SECTION} `)
      .replace(/\n{3,}/g, "\n\n")
  );
}

function extractSectionMatches(text) {
  const normalized = normalizeSectionGlyphs(text);
  const patterns = [
    /(^|\n)(\s*\u00a7\s*(\d+[a-z]?)(?:\.)?)/gim,
    /(^|\n)(\s*\u7b2c\s*(\d+[a-z]?)\s*\u8282)/gim
  ];
  const matches = [];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      matches.push({
        index: match.index ?? 0,
        prefix: String(match[1] || ""),
        section: String(match[3] || "").toLowerCase()
      });
    }
  }

  return matches.sort((left, right) => left.index - right.index);
}

function extractSectionsFromPlainText(text) {
  const normalized = normalizeSectionGlyphs(text);
  const matches = extractSectionMatches(normalized);
  const sections = new Map();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const section = match.section;
    const start = match.index + match.prefix.length;
    const end =
      next == null
        ? normalized.length
        : next.index + next.prefix.length;
    const raw = normalized.slice(start, end).trim();

    if (!raw) {
      continue;
    }

    sections.set(section, tidySectionText(raw));
  }

  return sections;
}

function compileConfiguredPattern(pattern) {
  const source = String(pattern || "").trim();
  if (!source) {
    return null;
  }

  try {
    return new RegExp(source, "imu");
  } catch {
    return null;
  }
}

function locateConfiguredPattern(text, pattern, start = 0) {
  const regex = compileConfiguredPattern(pattern);
  if (!regex) {
    return -1;
  }

  const slice = String(text).slice(start);
  const match = slice.match(regex);
  if (!match) {
    return -1;
  }

  return start + (match.index ?? slice.indexOf(match[0]));
}

function cropConfiguredPrimaryBody(text, entry) {
  const raw = String(text || "");
  const startIndex = Math.max(
    0,
    locateConfiguredPattern(raw, entry?.bodyStartPattern)
  );
  const searchStart = startIndex > 0 ? startIndex : 0;
  const endIndex = locateConfiguredPattern(
    raw,
    entry?.bodyEndPattern,
    searchStart
  );
  const sliced =
    endIndex > searchStart ? raw.slice(searchStart, endIndex) : raw.slice(searchStart);

  return normalizeWhitespace(sliced || raw);
}

function chunkText(text, chunkSize = 1400, overlap = 220) {
  const clean = normalizeWhitespace(text);
  if (!clean) return [];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(clean.length, start + chunkSize);
    if (end < clean.length) {
      const breakAt = clean.lastIndexOf("\n", end);
      if (breakAt > start + 500) {
        end = breakAt;
      }
    }

    const content = clean.slice(start, end).trim();
    if (content) {
      chunks.push(content);
    }

    if (end >= clean.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function compressText(text, maxLength = 520) {
  const clean = normalizeWhitespace(text);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength).trim()}...`;
}

function isSuppressedMention(text, index) {
  const prefix = String(text || "").slice(Math.max(0, index - 12), index);
  return /不要|别|勿|不该|不必|无需|不用|避免|不要再|别再/u.test(prefix);
}

function hasUnsuppressedMatch(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);

  for (const match of String(text || "").matchAll(regex)) {
    if (!isSuppressedMention(text, match.index ?? 0)) {
      return true;
    }
  }

  return false;
}

function expandQuery(query) {
  const raw = String(query || "");
  const expansions = [];
  const seen = new Set();

  function add(text) {
    const value = String(text || "").trim().toLowerCase();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    expansions.push(value);
  }

  add(raw);

  const mappings = [
    [/自由|liberty|freedom/i, "自由 freedom liberty freie freiheit"],
    [/意志|will|wille/i, "意志 will wille"],
    [/任性|任意|arbitrariness|caprice|willk/i, "任性 任意 arbitrariness caprice willkur willkür"],
    [/精神|spirit|mind|geist/i, "精神 spirit mind geist"],
    [/法哲学|法权|权利|right|recht/i, "法哲学 法权 权利 philosophy of right right recht"],
    [/百科全书|哲学全书|encyclopaedia|encyclopedia/i, "百科全书 哲学全书 encyclopaedia encyclopedia"],
    [/逻辑学|小逻辑|logic/i, "逻辑学 小逻辑 logic being essence concept"],
    [/自然哲学|nature/i, "自然哲学 nature externality"],
    [/精神哲学|subjective spirit|objective spirit|philosophy of spirit/i, "精神哲学 spirit subjective spirit objective spirit"],
    [/精神现象学|phenomenology/i, "精神现象学 phenomenology consciousness self-consciousness"],
    [/历史哲学|世界史|history/i, "历史哲学 世界史 history world history"],
    [/宗教哲学|religion/i, "宗教哲学 religion revealed religion"],
    [/美学|艺术|aesthetic|art/i, "美学 艺术 aesthetics art beauty"],
    [/哲学史|history of philosophy/i, "哲学史 history of philosophy"],
    [/耶拿|jena/i, "耶拿 jena"],
    [/早期|神学|theological|early/i, "早期 神学 theological early"],
    [/书信|通信|letters/i, "书信 通信 letters correspondence"]
  ];

  for (const [pattern, value] of mappings) {
    if (hasUnsuppressedMatch(raw, pattern)) {
      add(value);
    }
  }

  return expansions.join(" ");
}

function scoreChunk(query, chunk) {
  const q = expandQuery(query);
  const c = String(chunk || "").toLowerCase();
  let score = 0;
  const hasFreedomTopic = hasUnsuppressedMatch(query, /自由/u);
  const hasWillkurTopic = hasUnsuppressedMatch(query, /任意|任性/u);

  for (const token of q.split(/\s+/).filter(Boolean)) {
    if (token.length < 2) continue;
    if (c.includes(token)) {
      score += token.length;
    }
  }

  if (hasFreedomTopic && /自由/.test(chunk)) score += 16;
  if (hasWillkurTopic && /任意|任性/.test(chunk)) score += 16;
  if (/精神/.test(query) && /精神|意识|自我意识/.test(chunk)) score += 16;
  if (/法|权利|国家/.test(query) && /法|权利|国家|市民社会|伦理生活/.test(chunk)) score += 16;
  if (/逻辑/.test(query) && /逻辑|概念|本质|存在/.test(chunk)) score += 16;
  if (/历史/.test(query) && /历史|世界史|理性/.test(chunk)) score += 16;
  if (/宗教/.test(query) && /宗教|启示宗教|表象/.test(chunk)) score += 16;
  if (/美学|艺术/.test(query) && /美学|艺术|美/.test(chunk)) score += 16;

  return score;
}

function familyFromWorkId(workId) {
  const value = String(workId || "");

  if (value === "philosophy-of-right") return "philosophy-of-right";
  if (value === "phenomenology") return "phenomenology";
  if (value === "science-of-logic") return "science-of-logic";
  if (
    [
      "encyclopaedia",
      "subjective-spirit",
      "subjective-spirit-shorter",
      "objective-spirit"
    ].includes(value)
  ) {
    return "encyclopaedia-spirit";
  }
  if (value === "philosophy-of-nature") return "encyclopaedia-nature";
  if (value === "philosophy-of-history") return "philosophy-of-history";
  if (value === "history-of-philosophy") return "history-of-philosophy";
  if (value === "philosophy-of-religion") return "philosophy-of-religion";
  if (value === "aesthetics") return "aesthetics";
  if (value === "jena-lectures" || value === "difference-essay" || value === "natural-law") {
    return "jena-writings";
  }
  if (
    [
      "early-theological-writings",
      "fate-and-christianity",
      "positivity-of-christian-religion",
      "fragments",
      "german-constitution",
      "system-of-ethical-life",
      "first-philosophy-of-spirit",
      "classical-studies"
    ].includes(value)
  ) {
    return "early-writings";
  }

  return null;
}

function scoreBundleChinese(query, chunk) {
  const q = String(query || "");
  const c = String(chunk || "");
  const qTight = q.replace(/\s+/gu, "");
  const cTight = c.replace(/\s+/gu, "");
  let score = 0;

  const terms = [
    "自由",
    "意志",
    "精神",
    "法哲学",
    "法权",
    "权利",
    "国家",
    "伦理生活",
    "市民社会",
    "家庭",
    "小逻辑",
    "逻辑学",
    "自然哲学",
    "精神哲学",
    "精神现象学",
    "历史哲学",
    "哲学史讲演录",
    "宗教哲学",
    "宗教哲学演讲录",
    "美学",
    "艺术",
    "黑格尔早期著作集",
    "黑格尔早期神学著作",
    "体系片断",
    "法哲学原理"
  ];

  for (const term of terms) {
    const termTight = term.replace(/\s+/gu, "");
    if (
      (q.includes(term) || qTight.includes(termTight)) &&
      (c.includes(term) || cTight.includes(termTight))
    ) {
      score += Math.max(12, term.length * 3);
    }
  }

  return score;
}

function scorePrimaryChineseSignals(text) {
  const value = String(text || "");
  let score = 0;

  if (/\u00a7\s*\d+[a-z]?/i.test(value)) score += 20;
  if (/\u7b2c\s*\d+[a-z]?\s*\u8282/iu.test(value)) score += 20;
  if (/\u9644\u91ca|\u8865\u5145/u.test(value)) score += 10;

  return score;
}

function editorialPenalty(text) {
  const value = String(text || "");
  let penalty = 0;

  if (
    /\u8bd1\u8005|\u7f16\u8f91\u90e8|ISBN|CIP|\u51fa\u7248\u8bf4\u660e|\u7248\u672c|\u8d23\u4efb\u7f16\u8f91|\u5c01\u9762\u8bbe\u8ba1|\u4e66\u8bc4\u8ff0/u.test(
      value
    )
  ) {
    penalty += 80;
  }

  if (/\u8bd1\u8005\u5f15\u8a00|\u8bd1\u8005\u5e8f|\u8bd1\u8005\u5bfc\u8a00|\u540e\u8bb0/u.test(value)) {
    penalty += 120;
  }

  return penalty;
}

function familyFromGeneratedFile(fileName) {
  const prefix = String(fileName).split("--")[0];

  if (prefix === "philosophy-of-right") return "philosophy-of-right";
  if (prefix === "phenomenology") return "phenomenology";
  if (prefix === "science-of-logic" || prefix === "shorter-logic") {
    return "science-of-logic";
  }
  if (
    [
      "encyclopaedia",
      "subjective-spirit",
      "subjective-spirit-shorter",
      "objective-spirit",
      "absolute-spirit-selection"
    ].includes(prefix)
  ) {
    return "encyclopaedia-spirit";
  }
  if (prefix === "philosophy-of-nature") return "encyclopaedia-nature";
  if (prefix === "philosophy-of-history") return "philosophy-of-history";
  if (prefix === "history-of-philosophy") return "history-of-philosophy";
  if (prefix === "philosophy-of-religion") return "philosophy-of-religion";
  if (prefix === "aesthetics") return "aesthetics";
  if (
    [
      "difference-essay",
      "natural-law",
      "jena-lectures"
    ].includes(prefix)
  ) {
    return "jena-writings";
  }
  if (
    [
      "early-theological-writings",
      "fate-and-christianity",
      "positivity-of-christian-religion",
      "fragments",
      "german-constitution",
      "system-of-ethical-life",
      "first-philosophy-of-spirit",
      "classical-studies",
      "critical-journal-introduction",
      "elect-magistrates",
      "who-thinks-abstractly",
      "inaugural-address",
      "tercentenary-speech",
      "theses-1801",
      "proofs-of-god"
    ].includes(prefix)
  ) {
    return "early-writings";
  }

  return "misc";
}

function detectPromptFamilies(userPrompt) {
  const prompt = String(userPrompt || "");
  const families = new Set();

  const rules = [
    [/法哲学|法权|权利|philosophy of right|recht/i, "philosophy-of-right"],
    [/精神现象学|phenomenology/i, "phenomenology"],
    [/小逻辑|大逻辑|逻辑学|logic/i, "science-of-logic"],
    [/百科全书|哲学全书|精神哲学|主观精神|客观精神|绝对精神|encyclopaedia|encyclopedia|philosophy of spirit/i, "encyclopaedia-spirit"],
    [/自然哲学|nature/i, "encyclopaedia-nature"],
    [/历史哲学|世界史|history/i, "philosophy-of-history"],
    [/哲学史|history of philosophy/i, "history-of-philosophy"],
    [/宗教哲学|religion/i, "philosophy-of-religion"],
    [/美学|艺术|aesthetic|art/i, "aesthetics"],
    [/耶拿|difference essay|natural law/i, "jena-writings"],
    [/早期|神学|基督教|christianity|theological/i, "early-writings"],
    [/书信|通信|生平|年谱|letters|correspondence|chronology|biography/i, "biography"]
  ];

  for (const [pattern, family] of rules) {
    if (pattern.test(prompt)) {
      families.add(family);
    }
  }

  return [...families];
}

function collectRelevantFamilies(userPrompt, hits, parallelEntries) {
  const families = new Set(detectPromptFamilies(userPrompt));

  for (const hit of hits) {
    const family = familyFromWorkId(hit.workId);
    if (family) {
      families.add(family);
    }
  }

  for (const entry of parallelEntries) {
    for (const family of entry.families || []) {
      families.add(family);
    }
  }

  return [...families];
}

function hasOverlap(values, candidates) {
  const left = Array.isArray(values) ? values : [];
  const right = new Set(Array.isArray(candidates) ? candidates : []);
  return left.some((value) => right.has(value));
}

function formatSourceUrls(urls) {
  return (Array.isArray(urls) ? urls : []).filter(Boolean).join(" | ");
}

function hasExplicitWillkurTopic(prompt) {
  return hasUnsuppressedMatch(
    String(prompt || ""),
    /任意|任性|任意选择|willk\u00fcr|willkur|arbitrariness|caprice/i
  );
}

function buildTermGuide(families, userPrompt, termProfile, conceptPlan, ledger) {
  const relevant = new Set(families);
  const lines = [
    "Chinese term discipline:",
    `Active term profile: ${termProfile?.label || "unspecified"}`
  ];
  const preferredConceptIds =
    conceptPlan?.conceptTargets?.length
      ? conceptPlan.conceptTargets.map((target) => target.conceptId)
      : ["geist", "begriff", "wille", "freiheit"];

  for (const conceptId of preferredConceptIds) {
    if (conceptId === "willkuer" && !hasExplicitWillkurTopic(userPrompt)) {
      continue;
    }

    const concept = (ledger?.concepts || []).find(
      (entry) => entry.conceptId === conceptId
    );
    if (!concept) {
      continue;
    }

    const german = concept.de[0] || concept.en[0] || conceptId;
    const chineseTerms = resolveConceptTerms(
      conceptId,
      termProfile?.id || "",
      ledger,
      "zh-only"
    );
    if (!chineseTerms.length) {
      continue;
    }

    lines.push(`${german} -> ${chineseTerms.join(" / ")}`);
  }

  if (relevant.has("science-of-logic")) {
    lines.push("Wissenschaft der Logik -> 逻辑学");
    lines.push("Enzyklopaedische Logik / Smaller Logic -> 小逻辑");
  }

  if (relevant.has("philosophy-of-history")) {
    lines.push("Weltgeschichte -> 世界史");
  }

  return lines.join("\n");
}

async function ensureChineseDirs() {
  await mkdir(chineseDir, { recursive: true });
  await mkdir(textsDir, { recursive: true });
  await mkdir(generatedTextsDir, { recursive: true });
}

export async function loadChineseTranslationManifest() {
  await ensureChineseDirs();
  const ledger = await loadHegelConceptLedger();

  if (!existsSync(manifestPath)) {
    return normalizeChineseManifest({
      generatedAt: null,
      localTextInstructions: "",
      entries: [],
      localTexts: []
    }, ledger);
  }

  try {
    return normalizeChineseManifest(
      JSON.parse(await readFile(manifestPath, "utf8")),
      ledger
    );
  } catch {
    return normalizeChineseManifest({
      generatedAt: null,
      localTextInstructions: "",
      entries: [],
      localTexts: []
    }, ledger);
  }
}

export async function loadGeneratedChineseManifest() {
  await ensureChineseDirs();
  const ledger = await loadHegelConceptLedger();

  if (!ENABLE_GENERATED_CHINESE) {
    return {
      generatedAt: null,
      generatedTexts: []
    };
  }

  let manifest = {
    generatedAt: null,
    generatedTexts: []
  };

  if (!existsSync(generatedManifestPath)) {
    manifest = {
      generatedAt: null,
      generatedTexts: []
    };
  } else {
    try {
      manifest = JSON.parse(await readFile(generatedManifestPath, "utf8"));
    } catch {
      manifest = {
        generatedAt: null,
        generatedTexts: []
      };
    }
  }

  const files = (await readdir(generatedTextsDir)).filter((file) =>
    file.endsWith(".txt")
  );
  const existing = new Map(
    (manifest.generatedTexts || []).map((entry) => [entry.file, entry])
  );

  for (const file of files) {
    if (existing.has(file)) {
      continue;
    }

    existing.set(file, {
      id: file.replace(/\.txt$/i, ""),
      enabled: true,
      sourceFile: file,
      file,
      workId: familyFromGeneratedFile(file),
      editionId: file.replace(/\.txt$/i, ""),
      editionLabel: file.replace(/\.txt$/i, ""),
      families: [familyFromGeneratedFile(file)],
      title: file.replace(/\.txt$/i, ""),
      termProfileId: defaultGeneratedTermProfile(
        familyFromGeneratedFile(file),
        ledger
      ),
      precedence: 4,
      quoteStyle: "generated",
      conceptCoverage: inferConceptCoverage(familyFromGeneratedFile(file)),
      medium:
        "cached online-generated Chinese full text from the local English primary-text corpus"
    });
  }

  return {
    generatedAt: manifest.generatedAt,
    generatedTexts: [...existing.values()]
      .map((entry) => normalizeEditionEntry(entry, "generated", ledger))
      .sort((left, right) => String(left.file).localeCompare(String(right.file)))
  };
}

async function loadChineseSections(entry) {
  const filePath = resolveLocalChineseTextPath(entry);
  const cacheKey = JSON.stringify({
    filePath,
    bodyStartPattern: entry?.bodyStartPattern || "",
    bodyEndPattern: entry?.bodyEndPattern || ""
  });

  if (chineseSectionCache.has(cacheKey)) {
    return chineseSectionCache.get(cacheKey);
  }

  const rawText = await readFile(filePath, "utf8");
  const text = cropConfiguredPrimaryBody(rawText, entry);
  const sections = extractSectionsFromPlainText(text);
  chineseSectionCache.set(cacheKey, sections);
  return sections;
}

function resolveLocalChineseTextPath(entry) {
  const directPath = String(entry?.path || "").trim();
  if (directPath) {
    if (isAbsolute(directPath)) {
      return directPath;
    }
    return join(root, directPath);
  }

  const fileName = String(entry?.file || "").trim();
  if (!fileName) {
    return "";
  }

  if (isAbsolute(fileName)) {
    return fileName;
  }

  return join(textsDir, fileName);
}

async function loadGeneratedChineseSections(fileName) {
  if (generatedChineseSectionCache.has(fileName)) {
    return generatedChineseSectionCache.get(fileName);
  }

  const filePath = join(generatedTextsDir, fileName);
  const text = await readFile(filePath, "utf8");
  const sections = extractSectionsFromPlainText(text);
  generatedChineseSectionCache.set(fileName, sections);
  return sections;
}

async function collectLocalChineseChunks(manifest, families) {
  const chunks = [];

  for (const entry of [...(manifest.localTexts || [])].sort(
    (left, right) => Number(left.precedence || 99) - Number(right.precedence || 99)
  )) {
    if (entry.enabled === false) {
      continue;
    }
    if (families.length && !hasOverlap(entry.families, families)) {
      continue;
    }
    if (!entry.file) {
      if (!entry.path) {
        continue;
      }
    }

    const filePath = resolveLocalChineseTextPath(entry);
    if (!filePath) {
      continue;
    }
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const rawText = await readFile(filePath, "utf8");
      const text = cropConfiguredPrimaryBody(rawText, entry);
      const parts = chunkText(text);
      parts.forEach((content, index) => {
        chunks.push({
          id: `${entry.id || entry.file}:${index}`,
          workId: entry.workId,
          editionId: entry.editionId,
          editionLabel: entry.editionLabel,
          termProfileId: entry.termProfileId,
          precedence: entry.precedence,
          quoteStyle: entry.quoteStyle,
          conceptCoverage: entry.conceptCoverage,
          title: entry.title || entry.file,
          translator: entry.translator || "",
          publisher: entry.publisher || "",
          filePath,
          content
        });
      });
    } catch {
      // Keep local text lookup resilient.
    }
  }

  return chunks;
}

async function collectGeneratedChineseChunks(manifest, families) {
  const chunks = [];

  for (const entry of [...(manifest.generatedTexts || [])].sort(
    (left, right) => Number(left.precedence || 99) - Number(right.precedence || 99)
  )) {
    if (entry.enabled === false) {
      continue;
    }
    if (families.length && !hasOverlap(entry.families, families)) {
      continue;
    }
    if (!entry.file) {
      continue;
    }

    const filePath = join(generatedTextsDir, entry.file);
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const text = await readFile(filePath, "utf8");
      const parts = chunkText(text);
      parts.forEach((content, index) => {
        chunks.push({
          id: `${entry.id || entry.file}:${index}`,
          workId: entry.workId,
          editionId: entry.editionId,
          editionLabel: entry.editionLabel,
          termProfileId: entry.termProfileId,
          precedence: entry.precedence,
          quoteStyle: entry.quoteStyle,
          conceptCoverage: entry.conceptCoverage,
          title: entry.title || entry.file,
          translator: "salon generated",
          publisher: "",
          filePath,
          content,
          medium:
            entry.medium ||
            "cached online-generated Chinese full text"
        });
      });
    } catch {
      // Keep generated text lookup resilient.
    }
  }

  return chunks;
}

function compareEditionHits(left, right) {
  const scoreDelta = Number(right.score || 0) - Number(left.score || 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const precedenceDelta = Number(left.precedence || 99) - Number(right.precedence || 99);
  if (precedenceDelta !== 0) {
    return precedenceDelta;
  }

  return String(left.title || "").localeCompare(String(right.title || ""));
}

async function searchChineseLocalTexts(
  query,
  manifest,
  families,
  conceptPlan,
  ledger,
  limit = 4
) {
  const chunks = await collectLocalChineseChunks(manifest, families);

  return chunks
    .map((chunk) => ({
      ...chunk,
      score:
        scoreChunk(query, chunk.content) +
        scoreTextWithConceptPlan(chunk.content, conceptPlan, ledger, {
          mode: "zh-only",
          termProfileId: chunk.termProfileId
        }) +
        scoreBundleChinese(query, `${chunk.title}\n${chunk.content}`) +
        scorePrimaryChineseSignals(chunk.content) -
        editorialPenalty(`${chunk.title}\n${chunk.content}`)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort(compareEditionHits)
    .slice(0, limit);
}

async function searchGeneratedChineseTexts(
  query,
  manifest,
  families,
  conceptPlan,
  ledger,
  limit = 4
) {
  const chunks = await collectGeneratedChineseChunks(manifest, families);

  return chunks
    .map((chunk) => ({
      ...chunk,
      score:
        scoreChunk(query, chunk.content) +
        scoreTextWithConceptPlan(chunk.content, conceptPlan, ledger, {
          mode: "zh-only",
          termProfileId: chunk.termProfileId
        }) +
        scoreBundleChinese(query, `${chunk.title}\n${chunk.content}`)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort(compareEditionHits)
    .slice(0, limit);
}

export async function findChineseParallelSection(family, section) {
  const manifest = await loadChineseTranslationManifest();
  const generatedManifest = await loadGeneratedChineseManifest();

  for (const entry of [...(manifest.localTexts || [])].sort(
    (left, right) => Number(left.precedence || 99) - Number(right.precedence || 99)
  )) {
    if (entry.enabled === false) {
      continue;
    }
    if (!hasOverlap(entry.families, [family])) {
      continue;
    }
    if (!entry.file) {
      if (!entry.path) {
        continue;
      }
    }

    const filePath = resolveLocalChineseTextPath(entry);
    if (!filePath) {
      continue;
    }
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const sections = await loadChineseSections(entry);
      const text = sections.get(String(section).toLowerCase());

      if (!text) {
        continue;
      }

      const byline = [entry.title, entry.translator, entry.publisher]
        .filter(Boolean)
        .join(", ");

      return {
        text,
        url: filePath,
        medium: byline
          ? `checked local Chinese edition text (${byline})`
          : "checked local Chinese edition text",
        editionId: entry.editionId,
        editionLabel: entry.editionLabel,
        workId: entry.workId,
        termProfileId: entry.termProfileId,
        precedence: entry.precedence,
        quoteStyle: entry.quoteStyle,
        translator: entry.translator || "",
        publisher: entry.publisher || "",
        title: entry.title || ""
      };
    } catch {
      // Keep local section lookup resilient.
    }
  }

  for (const entry of [...(generatedManifest.generatedTexts || [])].sort(
    (left, right) => Number(left.precedence || 99) - Number(right.precedence || 99)
  )) {
    if (entry.enabled === false) {
      continue;
    }
    if (!hasOverlap(entry.families, [family])) {
      continue;
    }
    if (!entry.file) {
      continue;
    }

    const filePath = join(generatedTextsDir, entry.file);
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const sections = await loadGeneratedChineseSections(entry.file);
      const text = sections.get(String(section).toLowerCase());

      if (!text) {
        continue;
      }

      return {
        text,
        url: filePath,
        medium:
          entry.medium ||
          "cached online-generated Chinese full text",
        editionId: entry.editionId,
        editionLabel: entry.editionLabel,
        workId: entry.workId,
        termProfileId: entry.termProfileId,
        precedence: entry.precedence,
        quoteStyle: entry.quoteStyle,
        translator: "salon generated",
        publisher: "",
        title: entry.title || ""
      };
    } catch {
      // Keep generated section lookup resilient.
    }
  }

  return null;
}

function toEditionSummary(hit) {
  return {
    editionId: hit.editionId || "",
    editionLabel: hit.editionLabel || hit.title || "",
    workId: hit.workId || "",
    termProfileId: hit.termProfileId || "",
    precedence: hit.precedence ?? 99,
    quoteStyle: hit.quoteStyle || "",
    translator: hit.translator || "",
    publisher: hit.publisher || "",
    title: hit.title || "",
    medium: hit.medium || "",
    filePath: hit.filePath || hit.url || ""
  };
}

function pickPrimaryEdition(alignedChineseHits, localHits, relevantEntries) {
  const candidates = [
    ...alignedChineseHits.map(toEditionSummary),
    ...localHits.map(toEditionSummary),
    ...relevantEntries.map(toEditionSummary)
  ].filter((candidate) => candidate.editionId);

  if (!candidates.length) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const precedenceDelta = Number(left.precedence || 99) - Number(right.precedence || 99);
    if (precedenceDelta !== 0) {
      return precedenceDelta;
    }

    return String(left.editionLabel || "").localeCompare(String(right.editionLabel || ""));
  })[0];
}

function collectCompetingEditions(primaryEdition, manifest, generatedManifest) {
  if (!primaryEdition?.workId) {
    return [];
  }

  const candidates = [
    ...(manifest.localTexts || []).map((entry) => toEditionSummary(entry)),
    ...(manifest.localPdfSources || []).map((entry) => toEditionSummary(entry)),
    ...(manifest.entries || []).map((entry) => toEditionSummary(entry)),
    ...(generatedManifest.generatedTexts || []).map((entry) => toEditionSummary(entry))
  ].filter(
    (entry) =>
      entry.workId === primaryEdition.workId &&
      entry.editionId &&
      entry.editionId !== primaryEdition.editionId
  );

  const seen = new Set();
  return candidates
    .filter((entry) => {
      if (seen.has(entry.editionId)) {
        return false;
      }
      seen.add(entry.editionId);
      return true;
    })
    .sort((left, right) => {
      const precedenceDelta = Number(left.precedence || 99) - Number(right.precedence || 99);
      if (precedenceDelta !== 0) {
        return precedenceDelta;
      }
      return String(left.editionLabel || "").localeCompare(String(right.editionLabel || ""));
    })
    .slice(0, 4);
}

function findEditionRecord(primaryEdition, manifest, generatedManifest) {
  const targetId = String(primaryEdition?.editionId || "");
  if (!targetId) {
    return null;
  }

  const pools = [
    ...(manifest.localTexts || []),
    ...(manifest.localPdfSources || []),
    ...(manifest.entries || []),
    ...(generatedManifest.generatedTexts || [])
  ];

  return (
    pools.find((entry) => String(entry.editionId || entry.id || "") === targetId) ||
    null
  );
}

async function collectPrimaryEditionConceptHits(
  primaryEdition,
  manifest,
  generatedManifest,
  conceptPlan,
  ledger
) {
  if (!primaryEdition?.workId || !primaryEdition?.editionId) {
    return [];
  }

  if (!["checked-local", "ocr-local", "generated"].includes(primaryEdition.quoteStyle)) {
    return [];
  }

  const entry = findEditionRecord(primaryEdition, manifest, generatedManifest);
  if (!entry) {
    return [];
  }

  const sections = resolveConceptSections(conceptPlan, primaryEdition.workId, ledger);
  if (!sections.length) {
    return [];
  }

  let sectionMap = null;
  if (primaryEdition.quoteStyle === "generated") {
    if (!entry.file) {
      return [];
    }
    sectionMap = await loadGeneratedChineseSections(entry.file);
  } else {
    if (!(entry.file || entry.path)) {
      return [];
    }
    sectionMap = await loadChineseSections(entry);
  }

  const hits = [];
  for (const section of sections) {
    const text = sectionMap.get(String(section).toLowerCase());
    if (!text) {
      continue;
    }

    hits.push({
      editionId: primaryEdition.editionId,
      editionLabel: primaryEdition.editionLabel,
      workId: primaryEdition.workId,
      termProfileId: primaryEdition.termProfileId,
      precedence: primaryEdition.precedence,
      quoteStyle: primaryEdition.quoteStyle,
      title: primaryEdition.title,
      translator: primaryEdition.translator,
      publisher: primaryEdition.publisher,
      filePath: primaryEdition.filePath,
      locator: `§ ${section}`,
      medium: primaryEdition.medium,
      content: text
    });
  }

  return hits;
}

export async function buildChineseTranslationContext(
  userPrompt,
  hits,
  parallelEntries,
  conceptPlan = null,
  ledger = null
) {
  const effectiveLedger = ledger || (await loadHegelConceptLedger());
  const manifest = await loadChineseTranslationManifest();
  const generatedManifest = await loadGeneratedChineseManifest();
  const families = collectRelevantFamilies(userPrompt, hits, parallelEntries);
  const activeConceptPlan =
    conceptPlan || buildConceptPlan(userPrompt, families, effectiveLedger);
  const alignedChineseHits = (parallelEntries || [])
    .filter((entry) => entry?.chineseText)
    .map((entry) => ({
      editionId: entry.chineseEditionId || entry.editionId || "",
      editionLabel: entry.chineseEditionLabel || entry.chineseTitle || entry.work,
      workId: entry.chineseWorkId || entry.families?.[0] || "",
      termProfileId: entry.chineseTermProfileId || "",
      precedence: entry.chinesePrecedence ?? 99,
      quoteStyle: entry.chineseQuoteStyle || "checked-local",
      title: entry.chineseTitle || entry.work,
      translator: entry.chineseTranslator || "",
      publisher: entry.chinesePublisher || "",
      filePath: entry.chineseUrl || "",
      locator: `§ ${entry.section}`,
      medium: entry.chineseMedium || "",
      content: entry.chineseText
    }));
  const relevantEntries = (manifest.entries || [])
    .filter((entry) => (families.length ? hasOverlap(entry.families, families) : true))
    .sort((left, right) => Number(left.precedence || 99) - Number(right.precedence || 99));
  const localHits = await searchChineseLocalTexts(
    userPrompt,
    manifest,
    families,
    activeConceptPlan,
    effectiveLedger
  );
  const generatedHits = await searchGeneratedChineseTexts(
    userPrompt,
    generatedManifest,
    families,
    activeConceptPlan,
    effectiveLedger
  );
  const primaryEdition = pickPrimaryEdition(
    alignedChineseHits,
    localHits,
    relevantEntries
  );
  const conceptSectionHits = await collectPrimaryEditionConceptHits(
    primaryEdition,
    manifest,
    generatedManifest,
    activeConceptPlan,
    effectiveLedger
  );
  const competingEditionHits = collectCompetingEditions(
    primaryEdition,
    manifest,
    generatedManifest
  );
  const termProfile = getTermProfile(primaryEdition?.termProfileId, effectiveLedger);

  const lines = [
    "Chinese translation layer:",
    "Treat checked Chinese local text as quotable translation evidence.",
    "Treat bibliographic entries as translation-path guidance only unless the wording was actually loaded from a local Chinese text.",
    ENABLE_GENERATED_CHINESE
      ? "Treat cached online-generated Chinese full text only as an explicitly enabled supplemental translation layer, not as a historical printed edition."
      : "Cached online-generated Chinese full text is disabled in strict primary mode."
  ];

  if (primaryEdition) {
    lines.push(
      [
        "Primary Chinese edition line:",
        `Edition: ${primaryEdition.editionLabel}`,
        `Work: ${primaryEdition.workId || "unspecified"}`,
        `Translator: ${primaryEdition.translator || "not recorded"}`,
        `Publisher: ${primaryEdition.publisher || "not recorded"}`,
        `Term profile: ${termProfile?.label || primaryEdition.termProfileId || "unspecified"}`,
        `Quote style: ${primaryEdition.quoteStyle || "unspecified"}`,
        `Precedence: ${primaryEdition.precedence ?? "unspecified"}`
      ].join("\n")
    );
  }

  if (activeConceptPlan.conceptTargets.length) {
    lines.push(
      `Concept targets: ${activeConceptPlan.conceptTargets
        .map((target) => target.conceptId)
        .join(", ")}`
    );
  }

  if (activeConceptPlan.suppressedConcepts.length) {
    lines.push(
      `Suppressed concepts: ${activeConceptPlan.suppressedConcepts
        .map((target) => target.conceptId)
        .join(", ")}`
    );
  }

  if (alignedChineseHits.length || conceptSectionHits.length || localHits.length) {
    if (alignedChineseHits.length) {
      lines.push("Checked Chinese section-aligned hits:");

      for (const [index, hit] of alignedChineseHits.entries()) {
        lines.push(
          [
            `Aligned Chinese hit ${index + 1}`,
            `Title: ${hit.title}`,
            `Locator: ${hit.locator}`,
            `Translator: ${hit.translator || "not recorded in local manifest"}`,
            `Publisher: ${hit.publisher || "not recorded in local manifest"}`,
            `Medium: ${hit.medium || "checked local Chinese edition text"}`,
            `File: ${hit.filePath}`,
            `Quoted passage: "${compressText(hit.content)}"`
          ].join("\n")
        );
      }
    }

    if (conceptSectionHits.length) {
      lines.push("Concept-routed Chinese section hits:");

      for (const [index, hit] of conceptSectionHits.entries()) {
        lines.push(
          [
            `Concept section hit ${index + 1}`,
            `Title: ${hit.title}`,
            `Locator: ${hit.locator}`,
            `Translator: ${hit.translator || "not recorded in local manifest"}`,
            `Publisher: ${hit.publisher || "not recorded in local manifest"}`,
            `Medium: ${hit.medium || "checked local Chinese edition text"}`,
            `File: ${hit.filePath}`,
            `Quoted passage: "${compressText(hit.content)}"`
          ].join("\n")
        );
      }
    }

    lines.push("Checked local Chinese text hits:");

    for (const [index, hit] of localHits.entries()) {
      lines.push(
        [
          `Chinese hit ${index + 1}`,
          `Title: ${hit.title}`,
          `Translator: ${hit.translator || "not recorded in local manifest"}`,
          `Publisher: ${hit.publisher || "not recorded in local manifest"}`,
          `File: ${hit.filePath}`,
          `Quoted passage: "${compressText(hit.content)}"`
        ].join("\n")
      );
    }
  } else {
    lines.push("No checked local Chinese full text is currently loaded for this query.");
  }

  if (competingEditionHits.length) {
    lines.push("Competing edition lines for the same work:");

    for (const [index, entry] of competingEditionHits.entries()) {
      lines.push(
        [
          `Competing edition ${index + 1}`,
          `Edition: ${entry.editionLabel}`,
          `Translator: ${entry.translator || "not recorded"}`,
          `Publisher: ${entry.publisher || "not recorded"}`,
          `Term profile: ${entry.termProfileId || "unspecified"}`,
          `Quote style: ${entry.quoteStyle || "unspecified"}`,
          `Precedence: ${entry.precedence ?? "unspecified"}`
        ].join("\n")
      );
    }
  }

  if (ENABLE_GENERATED_CHINESE) {
    if (generatedHits.length) {
      lines.push("Cached online-generated Chinese full text hits:");

      for (const [index, hit] of generatedHits.entries()) {
        lines.push(
          [
            `Generated Chinese hit ${index + 1}`,
            `Title: ${hit.title}`,
            `Medium: ${hit.medium || "cached online-generated Chinese full text"}`,
            `File: ${hit.filePath}`,
            `Quoted passage: "${compressText(hit.content)}"`
          ].join("\n")
        );
      }
    } else {
      lines.push("No cached online-generated Chinese full text is currently loaded for this query.");
    }
  }

  if (relevantEntries.length) {
    lines.push("Relevant Chinese editions and translation paths:");

    for (const [index, entry] of relevantEntries.entries()) {
      lines.push(
        [
          `Chinese edition ${index + 1}`,
          `Work family: ${(entry.families || []).join(", ") || "unspecified"}`,
          `Chinese title: ${entry.chineseTitle || "unspecified"}`,
          `Translator: ${entry.translator || "translator not yet verified in this round"}`,
          `Publisher: ${entry.publisher || "publisher not yet verified in this round"}`,
          `Publication line: ${entry.publicationLine || "unspecified"}`,
          `Verification status: ${entry.verification || "unchecked"}`,
          `Source URLs: ${formatSourceUrls(entry.sourceUrls) || "none recorded"}`,
          `Notes: ${entry.notes || "none"}`
        ].join("\n")
      );
    }
  } else {
    lines.push("No relevant Chinese edition ledger entries were matched to this query.");
  }

  if (manifest.localTextInstructions) {
    lines.push(`Local Chinese text path: ${manifest.localTextInstructions}`);
  }

  lines.push(
    buildTermGuide(
      families,
      userPrompt,
      termProfile,
      activeConceptPlan,
      effectiveLedger
    )
  );

  return {
    contextText: lines.join("\n\n"),
    editions: relevantEntries,
    alignedChineseHits,
    conceptSectionHits,
    primaryEdition,
    competingEditionHits,
    conceptTargets: activeConceptPlan.conceptTargets,
    suppressedConcepts: activeConceptPlan.suppressedConcepts,
    termProfile,
    localHits,
    generatedHits,
    families
  };
}
