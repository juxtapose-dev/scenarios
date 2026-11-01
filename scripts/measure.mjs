import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { arch, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), "scenarios-cost-"));
const local = await mkdtemp(join(root, ".scenarios-measure-"));
const require = createRequire(import.meta.url);
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: "1" },
  });
  if (result.status !== 0)
    throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
async function bytes(path) {
  const info = await stat(path);
  if (!info.isDirectory()) return info.size;
  const entries = await readdir(path);
  return (await Promise.all(entries.map((entry) => bytes(join(path, entry))))).reduce(
    (a, b) => a + b,
    0,
  );
}
function median(samples) {
  return [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
}
async function bundle(name, code) {
  const entry = join(local, `${name}.mjs`);
  await writeFile(entry, code);
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: true,
      target: "es2023",
      lib: { entry, formats: ["es"], fileName: name },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) =>
    "output" in item ? item.output : [],
  );
  const js = outputs
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
  return {
    javascriptBytes: Buffer.byteLength(js),
    gzipBytes: outputs
      .filter((item) => item.type === "chunk")
      .reduce((size, item) => size + gzipSync(item.code).length, 0),
    chunks: outputs
      .filter((item) => item.type === "chunk")
      .map((item) => ({
        file: item.fileName,
        entry: item.isEntry,
        javascriptBytes: Buffer.byteLength(item.code),
        gzipBytes: gzipSync(item.code).length,
      })),
  };
}
try {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const report = {
    node: process.version,
    platform: `${platform()}-${arch()}`,
    packageVersion: manifest.version,
    fakerVersion: manifest.dependencies["@faker-js/faker"],
    samples: 5,
  };
  report.package = JSON.parse(
    run("npm", [
      "pack",
      "--dry-run",
      "--json",
      "--ignore-scripts",
      "--cache",
      join(directory, "npm-cache"),
    ]),
  ).map(({ size, unpackedSize, entryCount }) => ({
    archiveBytes: size,
    unpackedBytes: unpackedSize,
    entryCount,
  }))[0];
  report.fakerInstalledBytes = await bytes(
    resolve(require.resolve("@faker-js/faker/package.json"), ".."),
  );
  report.bundles = {};
  for (const [name, code] of [
    [
      "core",
      `export { defineFactory, defineScenario, loadScenarioFixtures } from ${JSON.stringify(pathToFileURL(join(root, "dist/index.js")).href)};`,
    ],
    [
      "inspection",
      `export * from ${JSON.stringify(pathToFileURL(join(root, "dist/inspection.js")).href)};`,
    ],
    ["fakerEnglish", 'export { Faker, en } from "@faker-js/faker";'],
  ]) {
    // Filesystem specifiers allow Vite to resolve the measured package build.
    report.bundles[name] = await bundle(name, code.replaceAll(pathToFileURL(root).href, root));
  }
  report.coldImports = {};
  for (const entry of ["index", "inspection"]) {
    const samples = Array.from({ length: 5 }, () =>
      Number(
        run(process.execPath, [
          "--input-type=module",
          "-e",
          `const start=performance.now(); await import(${JSON.stringify(pathToFileURL(join(root, `dist/${entry}.js`)).href)}); console.log(performance.now()-start);`,
        ]),
      ),
    );
    report.coldImports[entry] = { milliseconds: samples, medianMilliseconds: median(samples) };
  }
  if (process.argv.includes("--storybook")) {
    report.storybook = {};
    for (const mode of ["baseline", "scenarios"]) {
      const config = join(local, mode);
      await mkdir(config);
      await writeFile(
        join(config, "main.ts"),
        `export default { framework: '@storybook/react-vite', stories: ['./Measure.stories.tsx'], core: { disableTelemetry: true } };`,
      );
      const story =
        mode === "baseline"
          ? `export default { title: 'Measure' }; export const Example = { render: () => <p>Ada</p> };`
          : `import { defineFactory, defineScenario } from ${JSON.stringify(join(root, "src/index.ts"))}; import { withFixtures } from ${JSON.stringify(join(root, "src/storybook.ts"))}; const person = defineFactory({ version: '1', build: ({faker}) => ({name: faker.person.fullName()}) }); const data=withFixtures(defineScenario({id:'measure',seed:'fixed',now:'2026-01-01T00:00:00.000Z',fixtures:({factory})=>({person:factory('person',person)})})); export default { title: 'Measure' }; export const Example={...data.annotations, render: (_args, context) => <p>{data.read(context).person.name}</p>};`;
      await writeFile(join(config, "Measure.stories.tsx"), story);
    }
    // Alternate order to reduce warm-cache ordering bias; report raw samples too.
    const samples = { baseline: [], scenarios: [] };
    for (const order of [
      ["baseline", "scenarios"],
      ["scenarios", "baseline"],
      ["baseline", "scenarios"],
    ]) {
      for (const mode of order) {
        const start = performance.now();
        run("pnpm", [
          "exec",
          "storybook",
          "build",
          "--disable-telemetry",
          "--config-dir",
          join(local, mode),
          "--output-dir",
          join(directory, mode),
        ]);
        samples[mode].push(performance.now() - start);
      }
    }
    for (const mode of ["baseline", "scenarios"])
      report.storybook[mode] = {
        milliseconds: samples[mode],
        medianMilliseconds: median(samples[mode]),
        outputBytes: await bytes(join(directory, mode)),
      };
  }
  if (process.argv.includes("--check")) {
    if (report.bundles.core.gzipBytes > 180000)
      throw new Error(
        "Core bundle exceeded 180 KB gzip; check for accidental inclusion of other Faker locales",
      );
    if (report.bundles.inspection.gzipBytes > 4000)
      throw new Error(
        "Inspection bundle exceeded 4 KB gzip; keep it independent of generator/framework runtimes",
      );
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await rm(local, { recursive: true, force: true });
  await rm(directory, { recursive: true, force: true });
}
