import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, extname } from "node:path";

export async function writeTextFileAtomic(path, text, encoding = "utf8") {
  await mkdir(dirname(path), { recursive: true });

  const tempPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  const backupPath = `${path}.bak`;
  const handle = await open(tempPath, "w");

  try {
    await handle.writeFile(String(text), { encoding });
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(tempPath, path);
    return path;
  } catch {
    let movedOldFile = false;

    try {
      await rm(backupPath, { force: true });
    } catch {
      // Ignore backup cleanup failures before replacement.
    }

    try {
      await rename(path, backupPath);
      movedOldFile = true;
    } catch {
      movedOldFile = false;
    }

    try {
      await rename(tempPath, path);
      if (movedOldFile) {
        await rm(backupPath, { force: true }).catch(() => {});
      }
      return path;
    } catch (error) {
      if (movedOldFile) {
        try {
          await rename(backupPath, path);
        } catch {
          // Ignore restore failures and surface the original error.
        }
      }
      throw error;
    } finally {
      await rm(tempPath, { force: true }).catch(() => {});
    }
  }
}

export async function writeJsonFileAtomic(path, value, spacing = 2) {
  return writeTextFileAtomic(path, `${JSON.stringify(value, null, spacing)}\n`, "utf8");
}

export async function appendTextFileDurable(path, text, encoding = "utf8") {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "a");

  try {
    await handle.writeFile(String(text), { encoding });
    await handle.sync();
  } finally {
    await handle.close();
  }

  return path;
}

export async function readJsonFileWithRecovery(
  path,
  fallbackValue,
  { normalize = (value) => value, rewriteOnFailure = false } = {}
) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(String(raw || "").replace(/^\uFEFF/, ""));
    return normalize(parsed);
  } catch (error) {
    const corruptedSuffix = `.corrupt-${Date.now()}${extname(path) || ".json"}`;
    const corruptedPath = `${path}${corruptedSuffix}`;

    try {
      await rename(path, corruptedPath);
    } catch {
      // Ignore rename failures when the source file is already absent or locked.
    }

    const fallback =
      typeof fallbackValue === "function"
        ? fallbackValue()
        : structuredClone(fallbackValue);
    const normalizedFallback = normalize(fallback);

    if (rewriteOnFailure) {
      await writeJsonFileAtomic(path, normalizedFallback).catch(() => {});
    }

    return normalizedFallback;
  }
}
