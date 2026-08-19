import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RecentModel } from "./model-options.js";

interface HistoryFile {
  recent: RecentModel[];
}

function isRecentModel(value: unknown): value is RecentModel {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<RecentModel>;
  return typeof entry.provider === "string" && typeof entry.id === "string";
}

export async function readHistory(path: string): Promise<RecentModel[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<HistoryFile>;
    return Array.isArray(parsed.recent) ? parsed.recent.filter(isRecentModel).slice(0, 12) : [];
  } catch {
    return [];
  }
}

export async function writeHistory(path: string, recent: readonly RecentModel[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ recent }, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}
