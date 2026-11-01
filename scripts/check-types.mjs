import { readdir, readFile } from "node:fs/promises";
import { parse } from "@babel/parser";
import { parse as parseSvelte } from "svelte/compiler";

const violations = [];
async function inspect(path) {
  const text = await readFile(path, "utf8");
  const ast = path.endsWith(".svelte")
    ? parseSvelte(text, { modern: true })
    : parse(text, { sourceType: "module", plugins: ["typescript", "jsx"] });
  function visit(node) {
    if (node === null || typeof node !== "object") return;
    if (
      ["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression", "TSAnyKeyword"].includes(
        node.type,
      )
    ) {
      violations.push(
        `${path}:${node.loc.start.line}: type assertions, non-null assertions, and any are forbidden`,
      );
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  }
  visit(ast);
  if (/@ts-(ignore|expect-error|nocheck)/.test(text))
    violations.push(`${path}: TypeScript suppressions are forbidden`);
}
async function visitDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await visitDirectory(path);
      continue;
    }
    if (/\.(tsx?|svelte)$/.test(path)) await inspect(path);
  }
}
for (const directory of [
  "src",
  "tests",
  "example",
  "example-svelte",
  ".storybook",
  ".storybook-svelte",
  "scripts",
])
  await visitDirectory(directory);
for (const entry of await readdir(".")) if (entry.endsWith(".ts")) await inspect(entry);
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
}
