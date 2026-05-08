import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { corpusDir, projectRoot } from "./projectPaths.mjs";
import { findChineseParallelSection } from "./hegelChinese.mjs";

const root = projectRoot;
const cacheDir = join(corpusDir, "cache");
const textsDir = join(corpusDir, "texts");
const SECTION = "\u00a7";

const philosophyOfRightFiles = [
  {
    file: "philosophy-of-right--hegel-s-philosophy-of-right-introduction.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/pr/printrod.htm"
  },
  {
    file: "philosophy-of-right--hegel-s-philosophy-of-right-abstract-right.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/pr/abstract-right.htm"
  },
  {
    file: "philosophy-of-right--hegel-s-philosophy-of-right-property.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/pr/property.htm"
  },
  {
    file: "philosophy-of-right--hegel-s-philosophy-of-right-contract.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/pr/prcontra.htm"
  },
  {
    file: "philosophy-of-right--hegel-s-philosophy-of-right-morality.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/pr/prmorali.htm"
  },
  {
    file: "philosophy-of-right--hegel-s-philosophy-of-right-ethical-life.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/pr/ethical-life.htm"
  },
  {
    file: "philosophy-of-right--hegel-s-philosophy-of-right-the-family.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/pr/prfamily.htm"
  },
  {
    file: "philosophy-of-right--hegel-s-philosophy-of-right-civil-society.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/pr/prcivils.htm"
  },
  {
    file: "philosophy-of-right--hegel-s-philosophy-of-right-the-state.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/pr/prstate.htm"
  }
];

const philosophyOfSpiritFiles = [
  {
    file: "subjective-spirit--the-subjective-spirit.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/ss/subjective-spirit.htm"
  },
  {
    file: "encyclopaedia--the-subjective-spirit.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/sp/subjective-spirit.htm"
  },
  {
    file: "subjective-spirit-shorter--the-subjective-spirit.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/psi/index.htm"
  },
  {
    file: "encyclopaedia--the-objective-spirit-from-the-encyclopaedia-introduction.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/sp/sintro.htm"
  },
  {
    file: "encyclopaedia--the-objective-spirit-from-the-encyclopaedia-law.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/sp/sright.htm"
  },
  {
    file: "encyclopaedia--the-objective-spirit-from-the-encyclopaedia-morality.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/sp/smoral.htm"
  },
  {
    file: "encyclopaedia--the-objective-spirit-from-the-encyclopaedia-ethics.txt",
    url: "https://www.marxists.org/reference/archive/hegel/works/sp/sethics.htm"
  }
];

const fileSectionCache = new Map();
const germanSectionCache = new Map();
const anchoredEnglishSectionCache = new Map();

function sha1(text) {
  return createHash("sha1").update(text).digest("hex");
}

function normalizeWhitespace(text) {
  return String(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&#8220;|&#8221;/g, "\"")
    .replace(/&#8230;/g, "...")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)));
}

function stripHtml(html) {
  return normalizeWhitespace(
    decodeEntities(
      String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<\/h\d>/gi, "\n\n")
        .replace(/<li>/gi, "\n")
        .replace(/<\/li>/gi, "")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function normalizeSectionGlyphs(text) {
  return normalizeWhitespace(
    String(text)
      .replace(/&sect;/gi, SECTION)
      .replace(/\u6402/g, SECTION)
      .replace(/\u00a7\s+/g, `${SECTION} `)
      .replace(/\u00a7\./g, SECTION)
      .replace(/Hegel-by-HyperText[\s\S]*$/i, "")
      .replace(/Home Page @ marxists\.org[\s\S]*$/i, "")
  );
}

function compressText(text, maxLength = 520) {
  const clean = normalizeWhitespace(text);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength).trim()}...`;
}

function sectionNumber(section) {
  return Number.parseInt(String(section), 10);
}

function parseSectionKeys(text) {
  const keys = [];
  const seen = new Set();

  for (const match of String(text).matchAll(/(?:\u00a7|&sect;|\u6402)\s*(\d+[a-z]?)/gi)) {
    const key = match[1].toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }

  return keys;
}

function tidySectionText(text) {
  return normalizeSectionGlyphs(
    String(text)
      .replace(/^\s*\u00a7\s*/gim, `${SECTION} `)
      .replace(/\n{3,}/g, "\n\n")
  );
}

function extractSectionsFromPlainText(text) {
  const normalized = normalizeSectionGlyphs(text);
  const regex = /(^|\n)(\s*\u00a7\s*(\d+[a-z]?)(?:\.)?)/gim;
  const matches = [...normalized.matchAll(regex)];
  const sections = new Map();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const section = match[3].toLowerCase();
    const start = (match.index ?? 0) + String(match[1] || "").length;
    const end =
      next == null
        ? normalized.length
        : (next.index ?? normalized.length) + String(next[1] || "").length;
    const raw = normalized.slice(start, end).trim();

    if (!raw) {
      continue;
    }

    sections.set(section, tidySectionText(raw));
  }

  return sections;
}

function extractSectionsFromAnchoredHtml(html) {
  const regex = /<a[^>]+id="P(\d+[a-z]?)"[^>]*>\s*<\/a>/gi;
  const matches = [...String(html).matchAll(regex)];
  const sections = new Map();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const section = match[1].toLowerCase();
    const start = match.index ?? 0;
    const end = next?.index ?? html.length;
    const raw = stripHtml(html.slice(start, end));

    if (!raw) {
      continue;
    }

    sections.set(section, tidySectionText(raw));
  }

  return sections;
}

async function ensureCacheDir() {
  await mkdir(cacheDir, { recursive: true });
}

async function fetchCachedHtml(url) {
  await ensureCacheDir();
  const cachePath = join(cacheDir, `${sha1(url)}.html`);

  if (existsSync(cachePath)) {
    return readFile(cachePath, "utf8");
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "hegel-salon/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  await writeFile(cachePath, html, "utf8");
  return html;
}

async function loadSectionsFromFile(fileName) {
  if (fileSectionCache.has(fileName)) {
    return fileSectionCache.get(fileName);
  }

  const text = await readFile(join(textsDir, fileName), "utf8");
  const sections = extractSectionsFromPlainText(text);
  fileSectionCache.set(fileName, sections);
  return sections;
}

async function loadGermanSections(url) {
  if (germanSectionCache.has(url)) {
    return germanSectionCache.get(url);
  }

  const html = await fetchCachedHtml(url);
  const sections = extractSectionsFromAnchoredHtml(html);
  germanSectionCache.set(url, sections);
  return sections;
}

async function loadAnchoredEnglishSections(url) {
  if (anchoredEnglishSectionCache.has(url)) {
    return anchoredEnglishSectionCache.get(url);
  }

  const html = await fetchCachedHtml(url);
  const sections = extractSectionsFromAnchoredHtml(html);
  anchoredEnglishSectionCache.set(url, sections);
  return sections;
}

function philosophyOfRightGermanUrl(section) {
  const value = sectionNumber(section);

  if (value >= 1 && value <= 33) {
    return `https://hegel-system.de/de/recht1.htm#P${value}`;
  }

  if (value >= 34 && value <= 104) {
    return `https://hegel-system.de/de/recht2.htm#P${value}`;
  }

  if (value >= 105 && value <= 141) {
    return `https://hegel-system.de/de/recht3.htm#P${value}`;
  }

  if (value >= 142 && value <= 256) {
    return `https://hegel-system.de/de/recht4.htm#P${value}`;
  }

  if (value >= 257 && value <= 360) {
    return `https://hegel-system.de/de/recht5.htm#P${value}`;
  }

  return null;
}

function encyclopediaSpiritGermanUrl(section) {
  const value = sectionNumber(section);

  if (value >= 363 && value <= 577) {
    return `https://hegel-system.de/de/enz3.htm#P${value}`;
  }

  return null;
}

function getGermanUrlForFamily(family, section) {
  if (family === "philosophy-of-right") {
    return philosophyOfRightGermanUrl(section);
  }

  if (family === "encyclopaedia-spirit") {
    return encyclopediaSpiritGermanUrl(section);
  }

  return null;
}

function inferParallelWork(hit, section) {
  const workId = String(hit?.workId || "");
  const title = String(hit?.workTitle || "");
  const value = sectionNumber(section);

  if (workId === "philosophy-of-right" || /philosophy of right/i.test(title)) {
    return {
      family: "philosophy-of-right",
      work: "Grundlinien der Philosophie des Rechts",
      authority: "A",
      germanUrl: philosophyOfRightGermanUrl(section),
      englishFiles: philosophyOfRightFiles
    };
  }

  if (
    [
      "subjective-spirit",
      "subjective-spirit-shorter",
      "objective-spirit",
      "encyclopaedia"
    ].includes(workId) ||
    /subjective spirit|objective spirit|philosophy of spirit|encyclopaedia/i.test(title)
  ) {
    return {
      family: "encyclopaedia-spirit",
      work:
        value >= 483
          ? "Enzyklopaedie der philosophischen Wissenschaften III, Der objektive Geist"
          : "Enzyklopaedie der philosophischen Wissenschaften III, Der subjektive Geist",
      authority: "A",
      germanUrl: encyclopediaSpiritGermanUrl(section),
      englishFiles: philosophyOfSpiritFiles,
      englishPageUrl: "https://hegel.net/en/enz3.htm"
    };
  }

  return null;
}

function detectPromptFamilies(userPrompt) {
  const prompt = String(userPrompt || "");
  const families = [];

  if (/法哲学|法哲学原理|philosophy of right|recht/i.test(prompt)) {
    families.push({
      family: "philosophy-of-right",
      work: "Grundlinien der Philosophie des Rechts",
      authority: "A",
      englishFiles: philosophyOfRightFiles
    });
  }

  if (
    /百科|百科全书|精神哲学|主观精神|客观精神|encyclopaedia|encyclopedia|philosophy of spirit|subjective spirit|objective spirit/i.test(
      prompt
    )
  ) {
    families.push({
      family: "encyclopaedia-spirit",
      work: "Enzyklopaedie der philosophischen Wissenschaften III, Die Philosophie des Geistes",
      authority: "A",
      englishFiles: philosophyOfSpiritFiles,
      englishPageUrl: "https://hegel.net/en/enz3.htm"
    });
  }

  return families;
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

function hasExplicitWillkurTopic(prompt) {
  return hasUnsuppressedMatch(
    String(prompt || ""),
    /任意|任性|任意选择|willk\u00fcr|willkur|arbitrariness|caprice/i
  );
}

function getCanonicalSections(userPrompt, family) {
  const prompt = String(userPrompt || "");

  if (family === "philosophy-of-right") {
    if (/伦理生活|ethical life|sittlichkeit/i.test(prompt)) {
      return ["142", "145", "146", "147", "150", "156", "157", "257"];
    }

    if (/国家|state|staat/i.test(prompt)) {
      return ["257", "258", "260", "270", "272", "279", "324"];
    }

    if (/财产|property|eigentum/i.test(prompt)) {
      return ["41", "44", "45", "49", "65", "71"];
    }

    if (/契约|合同|contract/i.test(prompt)) {
      return ["72", "75", "77", "79", "81"];
    }

    if (/道德|morality/i.test(prompt)) {
      return ["105", "106", "107", "108", "141"];
    }

    if (hasExplicitWillkurTopic(prompt)) {
      return ["15", "16", "17", "5", "7", "10", "4"];
    }

    if (/自由|意志|will|freiheit|wille/i.test(prompt)) {
      return ["4", "5", "7", "10", "27", "29", "33"];
    }

    return ["1", "2", "4", "29", "33", "257", "258"];
  }

  if (family === "encyclopaedia-spirit") {
    if (/客观精神|objective spirit|recht|law|state/i.test(prompt)) {
      return ["483", "484", "485", "486", "487", "488", "490"];
    }

    if (/自由|精神|意志|geist|spirit|mind|freedom|will/i.test(prompt)) {
      return ["381", "382", "385", "386", "387", "482", "483"];
    }

    return ["381", "382", "385", "482", "483"];
  }

  return [];
}

async function findEnglishSection(
  section,
  files,
  fallbackUrl,
  fallbackText,
  remotePageUrl
) {
  if (remotePageUrl) {
    try {
      const sections = await loadAnchoredEnglishSections(remotePageUrl);
      if (sections.has(section)) {
        return {
          text: sections.get(section),
          url: `${remotePageUrl}#P${section}`,
          medium: `checked online English e-text (${remotePageUrl})`
        };
      }
    } catch {
      // Fall back to local files if remote alignment is unavailable.
    }
  }

  for (const entry of files) {
    try {
      const sections = await loadSectionsFromFile(entry.file);
      if (sections.has(section)) {
        return {
          text: sections.get(section),
          url: entry.url || fallbackUrl || "",
          medium: `cached local online translation (${entry.file})`
        };
      }
    } catch {
      // Keep lookup resilient.
    }
  }

  const excerpt = tidySectionText(fallbackText || "");
  if (!excerpt) {
    return null;
  }

  return {
    text: excerpt,
    url: fallbackUrl || "",
    medium: "cached local online translation excerpt from retrieval hit"
  };
}

async function findGermanSection(section, url) {
  if (!url) {
    return null;
  }

  const pageUrl = url.replace(/#.*$/, "");
  const sections = await loadGermanSections(pageUrl);
  const text = sections.get(String(section).toLowerCase());

  if (!text) {
    return null;
  }

  return {
    text,
    url
  };
}

function collectParallelCandidates(userPrompt, hits, limit = 4) {
  const preferredSections = parseSectionKeys(userPrompt);
  const preferredSet = new Set(preferredSections);
  const promptFamilies = detectPromptFamilies(userPrompt);
  const candidates = [];
  const seen = new Set();

  function pushCandidate(candidate) {
    const key = `${candidate.inferred.family}:${candidate.section}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push(candidate);
  }

  for (const family of promptFamilies) {
    const explicitSections = preferredSections.filter((section) =>
      getGermanUrlForFamily(family.family, section)
    );
    const sections =
      explicitSections.length > 0
        ? explicitSections
        : getCanonicalSections(userPrompt, family.family);

    for (const section of sections) {
      const germanUrl = getGermanUrlForFamily(family.family, section);
      if (!germanUrl) {
        continue;
      }

      pushCandidate({
        section,
        hit: null,
        inferred: {
          ...family,
          germanUrl,
          families: [family.family]
        },
        preferred: true,
        direct: true,
        order: candidates.length
      });
    }
  }

  for (const hit of hits) {
    const sections = [
      ...parseSectionKeys(hit.pageTitle),
      ...parseSectionKeys(hit.content)
    ];

    for (const section of sections) {
      const inferred = inferParallelWork(hit, section);
      if (!inferred?.germanUrl) {
        continue;
      }

      pushCandidate({
        section,
        hit,
        inferred,
        preferred: preferredSet.has(section),
        direct: false,
        order: Number.MAX_SAFE_INTEGER
      });

      if (candidates.length >= limit * 3) {
        break;
      }
    }

    if (candidates.length >= limit * 3) {
      break;
    }
  }

  return candidates
    .sort((left, right) => {
      const directDelta = Number(right.direct) - Number(left.direct);
      if (directDelta !== 0) {
        return directDelta;
      }

      const preferredDelta = Number(right.preferred) - Number(left.preferred);
      if (preferredDelta !== 0) {
        return preferredDelta;
      }

      const orderDelta = (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
      if (orderDelta !== 0) {
        return orderDelta;
      }

      return sectionNumber(left.section) - sectionNumber(right.section);
    })
    .slice(0, limit);
}

export async function buildParallelCitationContext(userPrompt, hits) {
  const candidates = collectParallelCandidates(userPrompt, hits);
  const entries = [];

  for (const candidate of candidates) {
    const german = await findGermanSection(
      candidate.section,
      candidate.inferred.germanUrl
    );
    const english = await findEnglishSection(
      candidate.section,
      candidate.inferred.englishFiles,
      candidate.hit?.url,
      candidate.hit?.content,
      candidate.inferred.englishPageUrl
    );
    const chinese = await findChineseParallelSection(
      candidate.inferred.family,
      candidate.section
    );

    if (!german || !english) {
      continue;
    }

    entries.push({
      work: candidate.inferred.work,
      section: candidate.section,
      authority: candidate.inferred.authority,
      families: candidate.inferred.families || [candidate.inferred.family],
      germanUrl: german.url,
      germanText: german.text,
      englishUrl: english.url,
      englishText: english.text,
      englishMedium: english.medium,
      chineseUrl: chinese?.url || "",
      chineseText: chinese?.text || "",
      chineseMedium: chinese?.medium || "",
      chineseEditionId: chinese?.editionId || "",
      chineseEditionLabel: chinese?.editionLabel || "",
      chineseWorkId: chinese?.workId || "",
      chineseTermProfileId: chinese?.termProfileId || "",
      chinesePrecedence: chinese?.precedence ?? 99,
      chineseQuoteStyle: chinese?.quoteStyle || "",
      chineseTranslator: chinese?.translator || "",
      chinesePublisher: chinese?.publisher || "",
      chineseTitle: chinese?.title || ""
    });
  }

  if (!entries.length) {
    return {
      contextText:
        "No aligned German-English citation bank was found for this query in the currently supported works.",
      entries: []
    };
  }

  const lines = [
    entries.some((entry) => entry.chineseText)
      ? "Aligned German-English-Chinese citation bank:"
      : "Aligned German-English citation bank:",
    "When one of the following passages is relevant, prefer it over looser memory.",
    "For each decisive quotation drawn from this bank, present three versions in the answer:",
    "German original, English translation, and Chinese translation.",
    "If no checked Chinese edition is loaded for a given section, supply your own Chinese rendering and keep that status honest in substance."
  ];

  for (const [index, entry] of entries.entries()) {
    lines.push(
      [
        `Parallel source ${index + 1}`,
        `Work: ${entry.work}`,
        `Locator: ${SECTION} ${entry.section}`,
        `Authority: ${entry.authority}`,
        `German source URL: ${entry.germanUrl}`,
        `German original: "${compressText(entry.germanText)}"`,
        `English verification medium: ${entry.englishMedium}`,
        `English source URL: ${entry.englishUrl || "same section in cached local online corpus"}`,
        `English translation: "${compressText(entry.englishText)}"`,
        entry.chineseText
          ? `Chinese verification medium: ${entry.chineseMedium}`
          : "Chinese verification medium: no checked Chinese edition text loaded for this section",
        entry.chineseText
          ? `Chinese source path: ${entry.chineseUrl}`
          : "Chinese source path: none",
        entry.chineseText
          ? `Chinese checked translation: "${compressText(entry.chineseText)}"`
          : "Chinese requirement: in the reply, give your own Chinese rendering of the same passage and state in substance that the Chinese wording is your rendering."
      ].join("\n")
    );
  }

  return {
    contextText: lines.join("\n\n"),
    entries
  };
}
