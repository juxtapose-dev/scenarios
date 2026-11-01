import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

async function digest(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${directory}/${entry.name}`;
    parts.push(entry.name, entry.isDirectory() ? await digest(path) : await readFile(path));
  }
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
}
const before = await digest("example/generated");
const result = spawnSync("pnpm", ["generate"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
if ((await digest("example/generated")) !== before) {
  console.error("Generated API files changed. Review and commit pnpm generate output.");
  process.exitCode = 1;
}
