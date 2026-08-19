import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HistoryStore, readHistory } from "../src/history.js";

test("serializes concurrent history writes and keeps the newest snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-picker-history-"));
  try {
    const path = join(directory, "history.json");
    const store = new HistoryStore(path);
    const first = store.write([{ provider: "a", id: "one" }]);
    const second = store.write([{ provider: "b", id: "two" }]);
    await Promise.all([first, second]);
    assert.deepEqual(await store.read(), [{ provider: "b", id: "two" }]);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("treats corrupt history as empty", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-picker-history-"));
  try {
    const path = join(directory, "history.json");
    await writeFile(path, "not-json");
    assert.deepEqual(await readHistory(path), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
