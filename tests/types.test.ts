import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = fileURLToPath(new URL("../src/index.js", import.meta.url));
const imports = `import { defineFactory, defineScenario, prepareScenario, resolveFlags, resolveExperiments } from ${JSON.stringify(entry)};\n`;
const factory = `const customer = defineFactory({ version: "1", build: ({ faker }) => ({ name: faker.person.fullName(), age: 42 }) });\n`;
const scenario = `const scenario = defineScenario({ id: "typed.sample", seed: "fixed", now: "2026-01-01T00:00:00.000Z", fixtures: context => ({ customer: context.factory("customer", customer) }) });\n`;

async function compile(source: string): Promise<{ status: number | null; output: string }> {
  const directory = await mkdtemp(join(tmpdir(), "rehearsal-types-"));
  const file = join(directory, "fixture.mts");
  try {
    await writeFile(file, imports + source);
    return await new Promise((resolve, reject) => {
      const child = spawn(
        "pnpm",
        [
          "exec",
          "tsc",
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--exactOptionalPropertyTypes",
          "--noUncheckedIndexedAccess",
          "--target",
          "es2023",
          "--lib",
          "es2023,dom",
          "--module",
          "nodenext",
          "--moduleResolution",
          "nodenext",
          "--skipLibCheck",
          file,
        ],
        { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      child.stdout.setEncoding("utf8").on("data", (data: string) => {
        output += data;
      });
      child.stderr.setEncoding("utf8").on("data", (data: string) => {
        output += data;
      });
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, output }));
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it("compiles inferred fixtures, assignments, and provider wiring", async () => {
  const result = await compile(
    factory +
      scenario +
      `
const execution = await prepareScenario(scenario);
function provider(value: { name: string; age: number }) { return value.name; }
const label: string = provider(execution.fixtures.customer);
const enabled: boolean = resolveFlags({ beta: false }, { beta: true }).beta;
const treatment: "control" | "compact" = resolveExperiments({ checkout: ["control", "compact"] }, { checkout: "control" }, { checkout: "compact" }).checkout;
await execution.dispose();
`,
  );
  expect(result.output).toBe("");
  expect(result.status).toBe(0);
}, 15000);

it.each([
  {
    name: "bad factory overrides",
    source:
      factory +
      `defineScenario({ id: "invalid", seed: "fixed", now: "2026-01-01T00:00:00.000Z", fixtures: context => context.factory("customer", customer, { age: "forty" }) });`,
    code: "TS2322",
  },
  {
    name: "unknown fixture properties",
    source:
      factory +
      scenario +
      `const execution = await prepareScenario(scenario); execution.fixtures.customer.missing;`,
    code: "TS2339",
  },
  {
    name: "unknown flags",
    source: `resolveFlags({ beta: false }, { missing: true });`,
    code: "TS2353",
  },
  {
    name: "invalid experiment treatments",
    source: `resolveExperiments({ checkout: ["control", "compact"] }, { checkout: "control" }, { checkout: "invalid" });`,
    code: "TS2322",
  },
])(
  "rejects $name with the expected compiler diagnostic",
  async ({ source, code }) => {
    const result = await compile(source);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(code);
  },
  15000,
);
