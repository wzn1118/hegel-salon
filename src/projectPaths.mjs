import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const projectRoot = join(moduleDir, "..");
export const publicDir = join(projectRoot, "public");
export const dataDir = join(projectRoot, "data");
export const researchDir = join(dataDir, "research");
export const corpusDir = join(dataDir, "corpus");
export const chineseCorpusDir = join(corpusDir, "chinese");

const codexRoot = process.env.CODEX_HOME || join(homedir(), ".codex");
const externalDistillRoot = join(codexRoot, "skills", "distill-hegel");
const bundledDistillRoot = researchDir;

export function resolveDistillFile(fileName) {
  const bundled = join(bundledDistillRoot, fileName);
  if (existsSync(bundled)) {
    return bundled;
  }

  return join(externalDistillRoot, fileName);
}

export function resolveDistillRoot() {
  return existsSync(bundledDistillRoot) ? bundledDistillRoot : externalDistillRoot;
}
