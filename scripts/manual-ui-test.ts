import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentDirectory = mkdtempSync(join(tmpdir(), "pi-model-picker-ui-"));

try {
  const result = spawnSync("pi", [
    "-ne",
    "-e", join(repository, "test", "manual-multi-provider.ts"),
    "-e", repository,
    "--provider", "ui-test-alpha",
    "--model", "alpha-small",
  ], {
    cwd: repository,
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: agentDirectory,
      PI_OFFLINE: "1",
    },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 0;
} finally {
  rmSync(agentDirectory, { recursive: true, force: true });
}
