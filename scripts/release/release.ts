import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageName = "@juxtapose/scenarios";
const registry = "https://registry.npmjs.org/@juxtapose%2fscenarios/";
const artifactName = "scenarios.tgz";
export interface ReleaseManifest {
  schemaVersion: 1;
  name: typeof packageName;
  version: string;
  revision: string;
  integrity: string;
}
export interface RegistryRecord {
  version: string;
  integrity: string;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function versionParts(version: string): [number, number, number] {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error("Release version must be canonical stable major.minor.patch");
  const [major, minor, patch] = version.split(".").map(Number);
  if (
    major === undefined ||
    minor === undefined ||
    patch === undefined ||
    ![major, minor, patch].every(Number.isSafeInteger)
  )
    throw new Error("Invalid release version");
  return [major, minor, patch];
}
export function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  return Math.sign(a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}
export function releaseNotes(changelog: string, version: string): string {
  versionParts(version);
  const section = changelog.split(/(?=^## )/m).find((part) => part.startsWith(`## ${version} — `));
  if (!section?.trim().includes("\n")) throw new Error(`Missing changelog entry for ${version}`);
  return `${section.trim()}\n`;
}
export function integrity(bytes: Uint8Array): string {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}
export function parseManifest(value: unknown): ReleaseManifest {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.name !== packageName ||
    typeof value.version !== "string" ||
    typeof value.revision !== "string" ||
    !/^[a-f0-9]{40}$/.test(value.revision) ||
    typeof value.integrity !== "string" ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(value.integrity)
  )
    throw new Error("Invalid release manifest");
  versionParts(value.version);
  return {
    schemaVersion: 1,
    name: packageName,
    version: value.version,
    revision: value.revision,
    integrity: value.integrity,
  };
}
export function publicationState(
  manifest: ReleaseManifest,
  existing: RegistryRecord | null,
  latest: RegistryRecord | null,
): "publish" | "already-published" {
  if (existing) {
    if (existing.version !== manifest.version || existing.integrity !== manifest.integrity)
      throw new Error(
        "Registry version exists with different integrity; never overwrite or republish it",
      );
    return "already-published";
  }
  if (latest && compareVersions(manifest.version, latest.version) <= 0)
    throw new Error("New release must be newer than the current latest version");
  return "publish";
}
export async function registryRecord(version: string): Promise<RegistryRecord | null> {
  if (version !== "latest") versionParts(version);
  const response = await fetch(`${registry}${version}?releaseCheck=${randomUUID()}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Registry lookup failed: HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (
    !record(value) ||
    value.name !== packageName ||
    typeof value.version !== "string" ||
    !record(value.dist) ||
    typeof value.dist.integrity !== "string"
  )
    throw new Error("Invalid registry response");
  versionParts(value.version);
  return { version: value.version, integrity: value.dist.integrity };
}
function run(command: string, args: readonly string[], liveOutput = false): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: liveOutput ? "inherit" : "pipe",
  });
  if (result.status !== 0)
    throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout?.trim() ?? "";
}
function context() {
  const revision = process.env.GITHUB_SHA;
  const version = process.env.RELEASE_VERSION;
  if (
    process.env.GITHUB_REPOSITORY !== "juxtapose-dev/scenarios" ||
    process.env.GITHUB_REF !== "refs/heads/main" ||
    !revision ||
    !/^[a-f0-9]{40}$/.test(revision) ||
    !version
  )
    throw new Error("Release must run for an exact main commit in juxtapose-dev/scenarios");
  versionParts(version);
  if (run("git", ["rev-parse", "HEAD"]) !== revision)
    throw new Error("Checkout does not match the workflow commit");
  if (run("git", ["status", "--porcelain"])) throw new Error("Release checkout must be clean");
  return { version, revision };
}
async function validatePackage(version: string): Promise<void> {
  const value: unknown = JSON.parse(await readFile("package.json", "utf8"));
  if (
    !record(value) ||
    value.name !== packageName ||
    value.version !== version ||
    !record(value.repository) ||
    value.repository.url !== "git+https://github.com/juxtapose-dev/scenarios.git"
  )
    throw new Error("Release version/package/repository must match the reviewed package.json");
}
async function loadArtifact(directory: string): Promise<ReleaseManifest> {
  const expected = context();
  await validatePackage(expected.version);
  const manifest = parseManifest(
    JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
  );
  if (manifest.revision !== expected.revision || manifest.version !== expected.version)
    throw new Error("Artifact belongs to another release commit/version");
  if (integrity(await readFile(join(directory, artifactName))) !== manifest.integrity)
    throw new Error("Release tarball integrity mismatch");
  const notes = releaseNotes(await readFile("CHANGELOG.md", "utf8"), manifest.version);
  if ((await readFile(join(directory, "notes.md"), "utf8")) !== notes)
    throw new Error("Release notes differ from the reviewed changelog");
  return manifest;
}
async function state(manifest: ReleaseManifest) {
  const [existing, latest] = await Promise.all([
    registryRecord(manifest.version),
    registryRecord("latest"),
  ]);
  return publicationState(manifest, existing, latest);
}
async function prepare(directory: string): Promise<void> {
  const { version, revision } = context();
  await validatePackage(version);
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    name: packageName,
    version,
    revision,
    integrity: integrity(await readFile(join(directory, artifactName))),
  };
  const notes = releaseNotes(await readFile("CHANGELOG.md", "utf8"), version);
  await state(manifest);
  await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(directory, "notes.md"), notes);
  console.log(`Prepared ${packageName}@${version} from ${revision}`);
}
async function publish(directory: string): Promise<void> {
  const manifest = await loadArtifact(directory);
  if ((await state(manifest)) === "publish") {
    run(
      "npm",
      [
        "publish",
        join(directory, artifactName),
        "--access",
        "public",
        "--tag",
        "latest",
        "--ignore-scripts",
      ],
      true,
    );
  } else console.log("Registry already contains the identical artifact; skipping publication");
  for (let attempt = 0; attempt < 90; attempt++) {
    const published = await registryRecord(manifest.version);
    if (published) {
      publicationState(manifest, published, null);
      const latest = await registryRecord("latest");
      if (latest && compareVersions(latest.version, manifest.version) >= 0) {
        console.log(`Verified registry integrity for ${packageName}@${manifest.version}`);
        return;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    "Publication returned but registry verification is still pending; retry this workflow",
  );
}
async function finish(directory: string): Promise<void> {
  const manifest = await loadArtifact(directory);
  const published = await registryRecord(manifest.version);
  if (!published) throw new Error("Cannot create a release before registry publication");
  publicationState(manifest, published, null);
  const tag = `v${manifest.version}`;
  const remoteTags = run("git", [
    "ls-remote",
    "--tags",
    "origin",
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ])
    .split("\n")
    .map((line) => line.split(/\s+/));
  const taggedCommit =
    remoteTags.find(([, name]) => name === `refs/tags/${tag}^{}`)?.[0] ??
    remoteTags.find(([, name]) => name === `refs/tags/${tag}`)?.[0];
  if (taggedCommit !== undefined && taggedCommit !== manifest.revision)
    throw new Error("Existing release tag points to another commit");
  const existingRelease = spawnSync("gh", ["release", "view", tag, "--json", "isDraft"], {
    encoding: "utf8",
  });
  if (existingRelease.status === 0) {
    const value: unknown = JSON.parse(existingRelease.stdout);
    if (taggedCommit === undefined || !record(value) || value.isDraft !== false)
      throw new Error("Existing GitHub release requires manual inspection");
    console.log(`GitHub release ${tag} already exists at the expected commit`);
    return;
  }
  if (taggedCommit === undefined)
    run("git", ["push", "origin", `${manifest.revision}:refs/tags/${tag}`]);
  run("gh", [
    "release",
    "create",
    tag,
    "--verify-tag",
    "--title",
    `Scenarios ${manifest.version}`,
    "--notes-file",
    join(directory, "notes.md"),
  ]);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , command, directory] = process.argv;
  if (!directory)
    throw new Error(
      "Usage: node scripts/release/release.ts prepare|publish|finish ARTIFACT_DIRECTORY",
    );
  if (command === "prepare") await prepare(resolve(directory));
  else if (command === "publish") await publish(resolve(directory));
  else if (command === "finish") await finish(resolve(directory));
  else throw new Error("Unknown release operation");
}
