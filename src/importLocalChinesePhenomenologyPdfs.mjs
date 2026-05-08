import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { projectRoot } from "./projectPaths.mjs";

const pdfDir = join(projectRoot, "local-resources", "phenomenology-pdfs");
const outputDir = join(projectRoot, "data", "corpus", "chinese", "texts");

const candidates = [
  {
    id: "local-pdf-phenomenology-helin-up",
    title: "精神现象学（贺麟、王玖兴译，上卷扫描本）",
    file: "phenomenology-helin-up.pdf",
    mode: "scan"
  },
  {
    id: "local-pdf-phenomenology-helin-down",
    title: "精神现象学（贺麟、王玖兴译，下卷扫描本）",
    file: "phenomenology-helin-down.pdf",
    mode: "scan"
  },
  {
    id: "local-pdf-phenomenology-xiangang-ocr",
    title: "精神现象学（先刚译 OCR 本）",
    file: "phenomenology-xiangang-ocr.pdf",
    mode: "ocr"
  }
];

function extractPdfText(pdfPath) {
  const script = [
    "import sys",
    "from pypdf import PdfReader",
    "reader = PdfReader(sys.argv[1])",
    "parts = []",
    "for page in reader.pages:",
    "    text = page.extract_text() or ''",
    "    if text.strip():",
    "        parts.append(text)",
    "print('\\n\\n'.join(parts))"
  ].join("\n");

  return execFileSync("python", ["-c", script, pdfPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8"
    },
    maxBuffer: 120 * 1024 * 1024
  });
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  for (const candidate of candidates) {
    const pdfPath = join(pdfDir, candidate.file);
    const outputFile = join(outputDir, `local-pdf--${candidate.id}.txt`);

    if (candidate.mode !== "ocr") {
      console.log(`Skipping image-only PDF ${candidate.file}`);
      continue;
    }

    const text = extractPdfText(pdfPath).trim();
    await writeFile(outputFile, text, "utf8");
    console.log(`Extracted ${candidate.file} -> ${outputFile}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
