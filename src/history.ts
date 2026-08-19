import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { RECENT_MODEL_LIMIT, type RecentModel } from "./model-options.js";

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
    return Array.isArray(parsed.recent)
      ? parsed.recent.filter(isRecentModel).slice(0, RECENT_MODEL_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export async function writeHistory(path: string, recent: readonly RecentModel[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ recent }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

/** Serialize writes so rapid model changes cannot race or leave stale history. */
export class HistoryStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async read(): Promise<RecentModel[]> {
    await this.pending;
    return readHistory(this.path);
  }

  write(recent: readonly RecentModel[]): Promise<void> {
    const snapshot = [...recent];
    const operation = this.pending.then(() => writeHistory(this.path, snapshot));
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
