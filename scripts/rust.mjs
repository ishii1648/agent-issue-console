import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = resolve(root, "packages/agent-issue-core");
const operation = process.argv[2];
const commands = {
  build: ["worker-build", ["--release", "--no-panic-recovery"]],
};

const selected = commands[operation];
if (!selected) {
  console.error("Usage: node scripts/rust.mjs build");
  process.exitCode = 2;
} else {
  const [command, args] = selected;
  const result = spawnSync(command, args, { cwd: core, env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
