import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot } from "./projectPaths.mjs";

const outputDir = join(projectRoot, "data", "corpus", "chinese", "texts");
const bundlePath = join(
  projectRoot,
  "local-resources",
  "hegel-14-bundle",
  "hegel-works-14.txt"
);

const segments = [
  { file: "local-bundle--early-theological-writings.txt", title: "黑格尔早期神学著作", start: 30, end: 3272 },
  { file: "local-bundle--science-of-logic-up.txt", title: "逻辑学（上卷）", start: 3278, end: 6518 },
  { file: "local-bundle--science-of-logic-down.txt", title: "逻辑学（下卷）", start: 6524, end: 9921 },
  { file: "local-bundle--philosophy-of-nature.txt", title: "自然哲学", start: 9927, end: 13697 },
  { file: "local-bundle--shorter-logic.txt", title: "小逻辑", start: 13703, end: 17958 },
  { file: "local-bundle--philosophy-of-right.txt", title: "法哲学原理", start: 17964, end: 23671 },
  { file: "local-bundle--aesthetics-vol1.txt", title: "美学（第一册）", start: 23677, end: 27379 },
  { file: "local-bundle--aesthetics-vol2.txt", title: "美学（第二册）", start: 27385, end: 31219 },
  { file: "local-bundle--aesthetics-vol3.txt", title: "美学（第三册）", start: 31225, end: 34511 },
  { file: "local-bundle--aesthetics-vol4.txt", title: "美学（第四册）", start: 34517, end: 38504 },
  { file: "local-bundle--history-of-philosophy-vol1.txt", title: "哲学史讲演录（第一卷）", start: 38510, end: 42425 },
  { file: "local-bundle--history-of-philosophy-vol2.txt", title: "哲学史讲演录（第二卷）", start: 42431, end: 46415 },
  { file: "local-bundle--history-of-philosophy-vol3.txt", title: "哲学史讲演录（第三卷）", start: 46421, end: 51403 },
  { file: "local-bundle--history-of-philosophy-vol4.txt", title: "哲学史讲演录（第四卷）", start: 51409, end: 57073 }
];

function normalizeText(text) {
  return String(text)
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLines(text) {
  return String(text || "").replace(/\r/g, "").split("\n");
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const source = await readFile(bundlePath, "utf8");
  const lines = splitLines(source);

  for (const segment of segments) {
    const content = normalizeText(lines.slice(segment.start - 1, segment.end).join("\n"));
    await writeFile(join(outputDir, segment.file), content, "utf8");
    console.log(`Wrote ${segment.file}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
