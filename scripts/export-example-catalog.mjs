import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { resolveScenarioCatalog } from "../dist/inspection.js";

const directory = await mkdtemp(join(tmpdir(), "scenarios-catalog-"));
try {
  // This is an explicit, trusted metadata module, not arbitrary discovered CSF.
  await build({
    configFile: false,
    logLevel: "silent",
    build: {
      ssr: resolve("example/catalog.ts"),
      outDir: directory,
      rollupOptions: { output: { entryFileNames: "catalog.mjs" } },
    },
  });
  const { catalog } = await import(pathToFileURL(join(directory, "catalog.mjs")).href);
  const index = JSON.parse(await readFile("storybook-static/index.json", "utf8"));
  const resolved = resolveScenarioCatalog(catalog, index);
  if (!process.argv.includes("--check")) console.log(JSON.stringify(resolved, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
