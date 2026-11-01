import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "rehearsal-package-"));
function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  run("pnpm", ["pack", "--pack-destination", directory]);
  const archive = (await readdir(directory)).find((name) => name.endsWith(".tgz"));
  if (!archive) throw new Error("No package archive created");
  const tarball = join(directory, archive);
  const files = run("tar", ["-tzf", tarball]).trim().split("\n");
  for (const file of files) {
    if (
      !/^package\/(dist\/[a-zA-Z0-9/.-]+\.(js|d\.ts)|package\.json|README\.md|LICENSE)$/.test(file)
    ) {
      throw new Error(`Unexpected published file: ${file}`);
    }
  }
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      join(directory, "cache"),
      tarball,
      "msw@3.0.3",
    ],
    directory,
  );
  await writeFile(
    join(directory, "smoke.mjs"),
    `
    import { defineFactory, defineScenario, prepareScenario } from '@juxtapose/rehearsal';
    import { rehearse } from '@juxtapose/rehearsal/storybook';
    import { createMswSession } from '@juxtapose/rehearsal/msw';
    const person = defineFactory({ version: '1', build: ({ faker }) => ({ name: faker.person.fullName() }) });
    const scenario = defineScenario({ id: 'pack/smoke', seed: 'public', now: '2026-01-01T00:00:00.000Z', fixtures: ({ factory }) => ({ person: factory('primary', person) }) });
    const a = await prepareScenario(scenario);
    const b = await prepareScenario(scenario);
    if (JSON.stringify(a.fixtures) !== JSON.stringify(b.fixtures)) throw new Error('Nondeterministic package');
    if (!rehearse(scenario).annotations || typeof createMswSession !== 'function') throw new Error('Broken exports');
    await a.dispose(); await b.dispose();
  `,
  );
  run(process.execPath, ["smoke.mjs"], directory);
  console.log(
    `Package smoke passed: ${files.length} allowlisted files, isolated imports, deterministic fixtures.`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
