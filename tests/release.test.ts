import { afterEach, expect, it, vi } from "vitest";
import {
  compareVersions,
  integrity,
  parseManifest,
  publicationState,
  registryRecord,
  releaseNotes,
  versionParts,
} from "../scripts/release/release.js";

const manifest = {
  schemaVersion: 1,
  name: "@juxtapose/scenarios",
  version: "0.3.0",
  revision: "a".repeat(40),
  integrity: integrity(Buffer.from("verified artifact")),
};
afterEach(() => vi.unstubAllGlobals());
it("rejects ambiguous, prerelease, and unsafe version inputs", () => {
  expect(versionParts("0.3.0")).toEqual([0, 3, 0]);
  for (const value of [
    "v0.3.0",
    "0.03.0",
    "0.3.0-beta.1",
    "0.3.0\n",
    "0.3.0; echo bad",
    "9007199254740992.0.0",
  ])
    expect(() => versionParts(value)).toThrow();
  expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
  expect(compareVersions("1.0.0", "0.99.0")).toBe(1);
});
it("extracts only the matching reviewed release notes", () => {
  const changelog =
    "# Changelog\n\n## 0.3.0 — 2026-11-01\n\nNew API.\n\n## 0.2.1 — 2026-11-01\n\nOld API.\n";
  expect(releaseNotes(changelog, "0.3.0")).toBe("## 0.3.0 — 2026-11-01\n\nNew API.\n");
  expect(() => releaseNotes(changelog, "0.4.0")).toThrow("Missing");
  expect(() => releaseNotes("## 0.3.0 — 2026-11-01\n\n", "0.3.0")).toThrow("Missing");
});
it("validates artifact metadata without coercion", () => {
  expect(parseManifest(manifest)).toEqual(manifest);
  for (const value of [
    { ...manifest, revision: "main" },
    { ...manifest, schemaVersion: 2 },
    { ...manifest, integrity: "sha512-invalid" },
    { ...manifest, name: "other" },
    null,
  ])
    expect(() => parseManifest(value)).toThrow("Invalid");
  expect(integrity(Buffer.from("changed artifact"))).not.toBe(manifest.integrity);
});
it("allows an identical rerun but refuses a conflicting immutable version", () => {
  const release = parseManifest(manifest);
  expect(publicationState(release, { version: "0.3.0", integrity: release.integrity }, null)).toBe(
    "already-published",
  );
  expect(() =>
    publicationState(release, { version: "0.3.0", integrity: "different" }, null),
  ).toThrow("different integrity");
  expect(() =>
    publicationState(release, { version: "0.2.1", integrity: release.integrity }, null),
  ).toThrow();
});
it("prevents a new publish from moving latest backward", () => {
  const release = parseManifest(manifest);
  expect(publicationState(release, null, { version: "0.2.1", integrity: "old" })).toBe("publish");
  expect(publicationState(release, null, null)).toBe("publish");
  expect(() => publicationState(release, null, { version: "0.4.0", integrity: "newer" })).toThrow(
    "newer",
  );
  expect(
    publicationState(
      release,
      { version: "0.3.0", integrity: release.integrity },
      { version: "0.4.0", integrity: "newer" },
    ),
  ).toBe("already-published");
});
it("distinguishes missing registry versions from authorization and transport failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  await expect(registryRecord("0.3.0")).resolves.toBeNull();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  await expect(registryRecord("0.3.0")).rejects.toThrow("HTTP 401");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(registryRecord("0.3.0")).rejects.toThrow("offline");
});
it("rejects malformed registry metadata and accepts a matching public record", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        name: "different",
        version: "0.3.0",
        dist: { integrity: manifest.integrity },
      }),
    ),
  );
  await expect(registryRecord("latest")).rejects.toThrow("Invalid registry");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        name: manifest.name,
        version: manifest.version,
        dist: { integrity: manifest.integrity },
      }),
    ),
  );
  await expect(registryRecord("latest")).resolves.toEqual({
    version: "0.3.0",
    integrity: manifest.integrity,
  });
});

it("rejects publishing from a pull-request context before reading artifacts or contacting npm", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    ["scripts/release/release.ts", "publish", "/private/tmp/no-release-artifact"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "juxtapose-dev/scenarios",
        GITHUB_REF: "refs/pull/1/merge",
        GITHUB_SHA: "a".repeat(40),
        RELEASE_VERSION: "0.3.0",
      },
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Release must run for an exact main commit");
});

it("avoids a cached missing-version response while checking a new publication", async () => {
  const requests = new Set<string>();
  vi.stubGlobal("fetch", async (url: string) => {
    requests.add(url);
    if (url === "https://registry.npmjs.org/@juxtapose%2fscenarios/0.3.0")
      return new Response(null, { status: 404 });
    return Response.json({
      name: manifest.name,
      version: manifest.version,
      dist: { integrity: manifest.integrity },
    });
  });
  await expect(registryRecord("0.3.0")).resolves.toEqual({
    version: manifest.version,
    integrity: manifest.integrity,
  });
  await expect(registryRecord("0.3.0")).resolves.toEqual({
    version: manifest.version,
    integrity: manifest.integrity,
  });
  expect(requests.size).toBe(2);
  for (const url of requests) expect(new URL(url).pathname).toBe("/@juxtapose%2fscenarios/0.3.0");
});
