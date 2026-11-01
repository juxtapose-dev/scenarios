import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repository = process.cwd();
const directory = await mkdtemp(join(tmpdir(), "juxtapose-scenarios-package-"));
function execute(command, args, cwd = process.cwd()) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}
function run(command, args, cwd = process.cwd()) {
  const result = execute(command, args, cwd);
  if (result.status !== 0)
    throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const packageCache = join(directory, "cache");
const compilerPackages = ["typescript@7.0.2", "typescript6@npm:typescript@6.0.3"];
const compilers = ["typescript", "typescript6"];
const consumerSources = join(repository, "scripts/package-consumers");
async function install(directory, dependencies) {
  await mkdir(directory, { recursive: true });
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
      packageCache,
      ...dependencies,
    ],
    directory,
  );
}
async function compileConsumer(directory, files, diagnostic) {
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        lib: ["ES2023", "DOM", "DOM.Iterable"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        types: [],
        jsx: "react-jsx",
      },
      files,
    }),
  );
  for (const compiler of compilers) {
    const result = execute(
      process.execPath,
      [
        join(directory, "node_modules", compiler, "bin/tsc"),
        "--project",
        "tsconfig.json",
        "--pretty",
        "false",
      ],
      directory,
    );
    const output = `${result.stdout}\n${result.stderr}`;
    if (diagnostic === undefined) {
      if (result.status !== 0) throw new Error(`${compiler} consumer failed:\n${output}`);
    } else {
      const diagnostics = [...output.matchAll(/error TS(\d+):/g)].map((match) => Number(match[1]));
      if (result.status === 0 || diagnostics.length !== 1 || diagnostics[0] !== diagnostic)
        throw new Error(`${compiler} expected exactly TS${diagnostic}:\n${output}`);
    }
  }
}
async function copyConsumers(directory, names) {
  for (const name of names) await copyFile(join(consumerSources, name), join(directory, name));
}
try {
  run("pnpm", ["pack", "--pack-destination", directory]);
  const archive = (await readdir(directory)).find((name) => name.endsWith(".tgz"));
  if (!archive) throw new Error("No package archive created");
  const tarball = join(directory, archive);
  const files = run("tar", ["-tzf", tarball]).trim().split("\n");
  for (const file of files) {
    if (
      !/^package\/(dist\/[a-zA-Z0-9/.-]+\.(js|d\.ts)|package\.json|README\.md|LICENSE|docs\/(fixture-loading|consumer-protocol)\.md)$/.test(
        file,
      )
    ) {
      throw new Error(`Unexpected published file: ${file}`);
    }
  }
  for (const guide of ["fixture-loading", "consumer-protocol"]) {
    if (!files.includes(`package/docs/${guide}.md`))
      throw new Error(`Missing published consumer guide: ${guide}`);
  }
  console.log("Checking peer-free core package with TypeScript 6 and 7...");
  const coreDirectory = join(directory, "core");
  await install(coreDirectory, [tarball, ...compilerPackages]);
  const coreDependencies = await readdir(join(coreDirectory, "node_modules"));
  if (coreDependencies.includes("msw") || coreDependencies.includes("storybook"))
    throw new Error("Core-only consumer unexpectedly installed optional peers");
  await copyConsumers(coreDirectory, ["core.ts", "negative-field.ts", "negative-override.ts"]);
  await compileConsumer(coreDirectory, ["core.ts"]);
  await compileConsumer(coreDirectory, ["negative-field.ts"], 2339);
  await compileConsumer(coreDirectory, ["negative-override.ts"], 2322);
  await writeFile(
    join(coreDirectory, "smoke.mjs"),
    `
    import { defineScenario, loadScenarioFixtures } from '@juxtapose/scenarios';
    const scenario = defineScenario({ id: 'pack/core-only', seed: 'public', now: '2026-01-01T00:00:00.000Z', fixtures: () => ({ values: [42] }) });
    const fixtures = await loadScenarioFixtures(scenario);
    const repeated = await loadScenarioFixtures(scenario);
    if (JSON.stringify(fixtures) !== JSON.stringify(repeated)) throw new Error('Nondeterministic peer-free fixture loading');
    fixtures.values.splice(0);
    if (repeated.values[0] !== 42) throw new Error('Fixture-only loads share mutable data');
  `,
  );
  run(process.execPath, ["smoke.mjs"], coreDirectory);
  console.log("Checking Storybook and MSW package consumers with TypeScript 6 and 7...");
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
      packageCache,
      tarball,
      "msw@3.0.3",
      "storybook@10.6.5",
      "@types/react@19.3.0",
      "@types/node@26.6.6",
      ...compilerPackages,
    ],
    directory,
  );
  await copyConsumers(directory, ["core.ts", "storybook.ts", "msw.ts", "negative-storybook.ts"]);
  await compileConsumer(directory, ["core.ts", "storybook.ts", "msw.ts"]);
  await compileConsumer(directory, ["negative-storybook.ts"], 2322);
  await writeFile(
    join(directory, "smoke.mjs"),
    `
    import { defineFactory, defineScenario, prepareScenario } from '@juxtapose/scenarios';
    import { withFixtures, withScenario } from '@juxtapose/scenarios/storybook';
    import { createMswSession } from '@juxtapose/scenarios/msw';
    const person = defineFactory({ version: '1', build: ({ faker }) => ({ name: faker.person.fullName() }) });
    const scenario = defineScenario({ id: 'pack/smoke', seed: 'public', now: '2026-01-01T00:00:00.000Z', fixtures: ({ factory }) => ({ person: factory('primary', person) }) });
    const a = await prepareScenario(scenario);
    const b = await prepareScenario(scenario);
    if (JSON.stringify(a.fixtures) !== JSON.stringify(b.fixtures)) throw new Error('Nondeterministic package');
    if (!withScenario(scenario).annotations || typeof createMswSession !== 'function') throw new Error('Broken exports');
    const provider = withFixtures(scenario);
    const loaded = await provider.annotations.loaders[0]();
    const fixtures = provider.read({ loaded });
    if (fixtures.person.name !== a.fixtures.person.name) throw new Error('Broken fixture-only Storybook export');
    await a.dispose(); await b.dispose();
  `,
  );
  run(process.execPath, ["smoke.mjs"], directory);
  console.log(
    `Package smoke passed: ${files.length} allowlisted files, isolated imports, deterministic fixtures, strict TypeScript 6/7 consumers and negative diagnostics.`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
