import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { loadCodexOpenAIConfig } from "./codexConfig.mjs";
import { chineseCorpusDir, corpusDir } from "./projectPaths.mjs";
import {
  defaultGeneratedTermProfile,
  loadHegelConceptLedger,
  resolveConceptTerms
} from "./hegelConcepts.mjs";

const sourceTextsDir = join(corpusDir, "texts");
const chineseDir = chineseCorpusDir;
const generatedTextsDir = join(chineseDir, "generated-texts");
const generatedManifestPath = join(chineseDir, "generated-manifest.json");
const DEFAULT_MAX_CHARS =
  Number.parseInt(process.env.HEGEL_TRANSLATE_MAX_CHARS || "6500", 10) || 6500;

function sha1(text) {
  return createHash("sha1").update(text).digest("hex");
}

function normalizeWhitespace(text) {
  return String(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMessageText(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("");
  }

  return "";
}

function getArg(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function familyFromSourceFile(fileName) {
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
      "theses-1801"
    ].includes(prefix)
  ) {
    return "early-writings";
  }

  return "misc";
}

function priorityForFamily(family) {
  const map = new Map([
    ["philosophy-of-right", 0],
    ["encyclopaedia-spirit", 1],
    ["phenomenology", 2],
    ["science-of-logic", 3],
    ["encyclopaedia-nature", 4],
    ["philosophy-of-history", 5],
    ["history-of-philosophy", 6],
    ["philosophy-of-religion", 7],
    ["aesthetics", 8],
    ["early-writings", 9],
    ["jena-writings", 10],
    ["misc", 11]
  ]);

  return map.get(family) ?? 99;
}

function buildTermProfileInstruction(termProfileId, ledger) {
  const labels = {
    geist: "Geist",
    begriff: "Begriff",
    wille: "Wille",
    freiheit: "Freiheit",
    sittlichkeit: "Sittlichkeit",
    willkuer: "Willkuer"
  };
  const parts = [];

  for (const conceptId of Object.keys(labels)) {
    const terms = resolveConceptTerms(conceptId, termProfileId, ledger, "zh-only");
    if (!terms.length) {
      continue;
    }
    parts.push(`${labels[conceptId]}=${terms.join("/")}`);
  }

  return parts.join(", ");
}

function splitLargeBlock(block, maxChars) {
  const pieces = [];
  const lines = String(block).split("\n");
  let current = "";

  for (const line of lines) {
    if (!line.trim()) {
      if (current.length + 2 <= maxChars) {
        current += `${current ? "\n" : ""}${line}`;
        continue;
      }
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current.trim()) {
      pieces.push(current.trim());
      current = "";
    }

    if (line.length <= maxChars) {
      current = line;
      continue;
    }

    let start = 0;
    while (start < line.length) {
      let end = Math.min(line.length, start + maxChars);
      if (end < line.length) {
        const breakAt = line.lastIndexOf(" ", end);
        if (breakAt > start + 600) {
          end = breakAt;
        }
      }
      pieces.push(line.slice(start, end).trim());
      start = end;
    }
  }

  if (current.trim()) {
    pieces.push(current.trim());
  }

  return pieces.filter(Boolean);
}

function splitForTranslation(text, maxChars = DEFAULT_MAX_CHARS) {
  const blocks = normalizeWhitespace(text).split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const block of blocks) {
    const clean = block.trim();
    if (!clean) {
      continue;
    }

    if (clean.length > maxChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      chunks.push(...splitLargeBlock(clean, maxChars));
      continue;
    }

    const candidate = current ? `${current}\n\n${clean}` : clean;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }
    current = clean;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

async function ensureDirs() {
  await mkdir(chineseDir, { recursive: true });
  await mkdir(generatedTextsDir, { recursive: true });
}

async function loadGeneratedManifest() {
  await ensureDirs();

  if (!existsSync(generatedManifestPath)) {
    return {
      generatedAt: null,
      generatedTexts: []
    };
  }

  try {
    return JSON.parse(await readFile(generatedManifestPath, "utf8"));
  } catch {
    return {
      generatedAt: null,
      generatedTexts: []
    };
  }
}

async function saveGeneratedManifest(manifest) {
  await writeFile(
    generatedManifestPath,
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
}

function toApiUrl(baseURL, path) {
  return new URL(path, `${String(baseURL).replace(/\/+$/, "")}/`).toString();
}

async function requestTranslation(config, chunk, termInstruction, attempt = 1) {
  const response = await fetch(toApiUrl(config.baseURL, "chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      model: process.env.HEGEL_TRANSLATE_MODEL || config.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            [
              "You translate Hegel source texts into Chinese for a research corpus.",
              "Output plain text only.",
              "Preserve section markers such as § 4, § 15, § 381 exactly.",
              "Preserve heading lines and paragraph breaks when they matter.",
              "Do not add commentary, markdown, bullets, asterisks, or hash signs.",
              "Use the active term profile for this work:",
              termInstruction || "Geist=精神, Begriff=概念, Wille=意志, Freiheit=自由.",
              "Translate faithfully, but aim for readable philosophical Chinese rather than word-for-word awkwardness."
            ].join("\n")
        },
        {
          role: "user",
          content: chunk
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    if (attempt >= 3) {
      throw new Error(
        `Translation request failed (${response.status}): ${detail.slice(0, 400)}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    return requestTranslation(config, chunk, termInstruction, attempt + 1);
  }

  const payload = await response.json();
  const text = normalizeWhitespace(extractMessageText(payload));

  if (!text) {
    if (attempt >= 3) {
      throw new Error("Translation request returned empty text.");
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    return requestTranslation(config, chunk, termInstruction, attempt + 1);
  }

  return text;
}

async function translateFile(config, fileName, termInstruction) {
  const sourcePath = join(sourceTextsDir, fileName);
  const sourceText = await readFile(sourcePath, "utf8");
  const chunks = splitForTranslation(sourceText);
  const translatedChunks = [];

  console.log(`Translating ${fileName} in ${chunks.length} chunk(s)...`);

  for (const [index, chunk] of chunks.entries()) {
    console.log(`  chunk ${index + 1}/${chunks.length}`);
    translatedChunks.push(await requestTranslation(config, chunk, termInstruction));
  }

  return {
    sourceText,
    translatedText: `${translatedChunks.join("\n\n")}\n`
  };
}

async function main() {
  const config = loadCodexOpenAIConfig();
  const conceptLedger = await loadHegelConceptLedger();

  if (!config.apiKey || !config.baseURL) {
    throw new Error("Missing online model configuration in Codex config.");
  }

  const force = hasFlag("--force");
  const matchArg = getArg("--match");
  const limitArg = Number.parseInt(getArg("--limit", "0"), 10) || 0;
  const matcher = matchArg ? new RegExp(matchArg, "i") : null;

  const files = (await readdir(sourceTextsDir))
    .filter((file) => file.endsWith(".txt"))
    .filter((file) => (matcher ? matcher.test(file) : true))
    .sort((left, right) => {
      const familyDelta =
        priorityForFamily(familyFromSourceFile(left)) -
        priorityForFamily(familyFromSourceFile(right));
      if (familyDelta !== 0) {
        return familyDelta;
      }
      return left.localeCompare(right);
    });

  const selectedFiles = limitArg > 0 ? files.slice(0, limitArg) : files;
  const manifest = await loadGeneratedManifest();
  const existingMap = new Map(
    (manifest.generatedTexts || []).map((entry) => [entry.sourceFile, entry])
  );
  const existingByHash = new Map(
    (manifest.generatedTexts || [])
      .filter((entry) => entry.sourceHash && entry.file)
      .map((entry) => [entry.sourceHash, entry])
  );

  console.log(`Selected ${selectedFiles.length} source file(s).`);

  for (const [index, fileName] of selectedFiles.entries()) {
    const sourcePath = join(sourceTextsDir, fileName);
    const sourceText = await readFile(sourcePath, "utf8");
    const sourceHash = sha1(sourceText);
    const current = existingMap.get(fileName);
    const targetFile = fileName;
    const targetPath = join(generatedTextsDir, targetFile);

    if (
      !force &&
      current?.sourceHash === sourceHash &&
      existsSync(targetPath)
    ) {
      console.log(
        `[${index + 1}/${selectedFiles.length}] Skipping ${fileName} (up to date).`
      );
      continue;
    }

    const reusable = !force ? existingByHash.get(sourceHash) : null;
    if (
      reusable &&
      reusable.sourceFile !== fileName &&
      existsSync(join(generatedTextsDir, reusable.file))
    ) {
      console.log(
        `[${index + 1}/${selectedFiles.length}] Reusing translation for ${basename(fileName)} from ${basename(reusable.sourceFile)}`
      );
      const reusedText = await readFile(
        join(generatedTextsDir, reusable.file),
        "utf8"
      );
      await writeFile(targetPath, reusedText, "utf8");

      const family = familyFromSourceFile(fileName);
      const termProfileId = defaultGeneratedTermProfile(family, conceptLedger);
      const entry = {
        id: fileName.replace(/\.txt$/i, ""),
        enabled: true,
        sourceFile: fileName,
        file: targetFile,
        workId: family,
        editionId: fileName.replace(/\.txt$/i, ""),
        editionLabel: fileName.replace(/\.txt$/i, ""),
        families: [family],
        title: fileName.replace(/\.txt$/i, ""),
        termProfileId,
        precedence: 4,
        quoteStyle: "generated",
        conceptCoverage: [],
        medium:
          "cached online-generated Chinese full text from the local English primary-text corpus",
        sourceHash,
        sourceLength: sourceText.length,
        translatedAt: reusable.translatedAt || new Date().toISOString()
      };

      existingMap.set(fileName, entry);
      existingByHash.set(sourceHash, entry);
      manifest.generatedTexts = [...existingMap.values()].sort((left, right) =>
        String(left.sourceFile).localeCompare(String(right.sourceFile))
      );
      manifest.generatedAt = new Date().toISOString();
      await saveGeneratedManifest(manifest);
      continue;
    }

    console.log(`[${index + 1}/${selectedFiles.length}] ${basename(fileName)}`);
    const family = familyFromSourceFile(fileName);
    const termProfileId = defaultGeneratedTermProfile(family, conceptLedger);
    const termInstruction = buildTermProfileInstruction(
      termProfileId,
      conceptLedger
    );
    const { translatedText } = await translateFile(
      config,
      fileName,
      termInstruction
    );
    await writeFile(targetPath, translatedText, "utf8");

    const entry = {
      id: fileName.replace(/\.txt$/i, ""),
      enabled: true,
      sourceFile: fileName,
      file: targetFile,
      workId: family,
      editionId: fileName.replace(/\.txt$/i, ""),
      editionLabel: fileName.replace(/\.txt$/i, ""),
      families: [family],
      title: fileName.replace(/\.txt$/i, ""),
      termProfileId,
      precedence: 4,
      quoteStyle: "generated",
      conceptCoverage: [],
      medium:
        "cached online-generated Chinese full text from the local English primary-text corpus",
      sourceHash,
      sourceLength: sourceText.length,
      translatedAt: new Date().toISOString()
    };

    existingMap.set(fileName, entry);
    existingByHash.set(sourceHash, entry);
    manifest.generatedTexts = [...existingMap.values()].sort((left, right) =>
      String(left.sourceFile).localeCompare(String(right.sourceFile))
    );
    manifest.generatedAt = new Date().toISOString();
    await saveGeneratedManifest(manifest);
  }

  console.log("Chinese generated corpus update finished.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
