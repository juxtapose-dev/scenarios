import { expect, it } from "vitest";
import {
  defineFactory,
  defineScenario,
  describeScenario,
  prepareScenario,
  ScenarioPreparationError,
} from "../src/index.js";
import {
  createScenarioCatalog,
  createScenarioEvidence,
  inspectScenario,
  resolveScenarioCatalog,
} from "../src/inspection.js";

const scenario = defineScenario({
  id: "inspection/test",
  revision: "2",
  checkpoints: ["loaded"],
  seed: "fixed",
  now: "2026-01-01T00:00:00.000Z",
  fixtures: ({ factory }) => ({
    customer: factory(
      "customer",
      defineFactory({ version: "3", build: () => ({ secret: "fixture-payload" }) }),
    ),
  }),
});
const target = { storyId: "inspection--test" };

it("catalogs detached metadata without evaluating fixture or setup callbacks", () => {
  const definition = defineScenario({
    ...scenario,
    fixtures: () => {
      throw new Error("must not run");
    },
    setup: () => {
      throw new Error("must not run");
    },
  });
  const entry = { storyId: "z--story", scenario: describeScenario(definition) };
  const catalog = createScenarioCatalog([entry, { ...entry, storyId: "a--story" }]);
  expect(catalog.entries.map((value) => value.storyId)).toEqual(["a--story", "z--story"]);
  entry.scenario = { ...entry.scenario, environment: { modified: true } };
  expect(catalog.entries[0]?.scenario.environment).toEqual({});
  expect(() => createScenarioCatalog([entry, entry])).toThrow("duplicate");
  expect(JSON.stringify(catalog)).not.toContain("fixture-payload");
});

it("reports absent instrumentation, idle, wrong story and a replaced execution distinctly", async () => {
  expect(inspectScenario(undefined, target).code).toBe("instrumentation-missing");
  expect(inspectScenario(null, target).code).toBe("no-execution");
  const run = await prepareScenario(scenario);
  const observed = { ...target, execution: run.snapshot() };
  expect(inspectScenario(observed, { storyId: "another--story" }).code).toBe("wrong-story");
  expect(inspectScenario(observed, { ...target, executionId: "old" }).code).toBe(
    "execution-replaced",
  );
  await run.dispose();
});

it("requires declared checkpoints and play-complete, then binds evidence to a source revision", async () => {
  const run = await prepareScenario(scenario, { sourceRevision: "build-abc" });
  const observe = () => ({ ...target, execution: run.snapshot() });
  expect(inspectScenario(observe(), target).pendingCheckpoints).toEqual([
    "loaded",
    "play-complete",
  ]);
  await run.checkpoint("loaded", () => true);
  expect(inspectScenario(observe(), target).status).toBe("waiting");
  expect(() => createScenarioEvidence(observe())).toThrow("play-complete");
  await run.checkpoint("play-complete", () => true);
  expect(inspectScenario(observe(), target).status).toBe("ready");
  const evidence = createScenarioEvidence(observe());
  expect(evidence).toMatchObject({
    sourceRevision: "build-abc",
    factories: [{ key: "customer", version: "3" }],
    descriptor: { revision: "2", locale: "en", fakerVersion: "10.6.0" },
  });
  expect(JSON.stringify(evidence)).not.toContain("fixture-payload");
  expect(() => createScenarioEvidence(observe(), { sourceRevision: "different" })).toThrow(
    "conflicts",
  );
  run.fail("network", "late failure");
  expect(inspectScenario(observe(), target).code).toBe("execution-failed");
  expect(() => createScenarioEvidence(observe())).toThrow("failed");
  await run.dispose();
  expect(inspectScenario(observe(), target).code).toBe("execution-failed");
});

it("never accepts a disposed run or invents a source revision", async () => {
  const run = await prepareScenario(scenario);
  await run.checkpoint("loaded", () => true);
  await run.checkpoint("play-complete", () => true);
  const observed = { ...target, execution: run.snapshot() };
  expect(() => createScenarioEvidence(observed)).toThrow("source revision");
  expect(
    createScenarioEvidence(observed, { sourceRevision: "external-build" }).sourceRevision,
  ).toBe("external-build");
  await run.dispose();
  expect(inspectScenario({ ...target, execution: run.snapshot() }, target).code).toBe(
    "execution-disposed",
  );
});

it("keeps factory and source metadata on failed preparation", async () => {
  try {
    await prepareScenario(
      defineScenario({
        ...scenario,
        fixtures: (context) => {
          scenario.fixtures(context);
          throw new Error("broken fixture");
        },
      }),
      { sourceRevision: "broken-build" },
    );
    throw new Error("Expected preparation failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ScenarioPreparationError);
    if (!(error instanceof ScenarioPreparationError)) throw error;
    expect(error.snapshot).toMatchObject({
      sourceRevision: "broken-build",
      factories: [{ key: "customer", version: "3" }],
    });
  }
});

it("validates declared revisions/checkpoints and copies declaration inputs", () => {
  const checkpoints = ["loaded"];
  const definition = defineScenario({ ...scenario, checkpoints });
  checkpoints.push("mutated");
  expect(describeScenario(definition).checkpoints).toEqual(["loaded"]);
  expect(() => defineScenario({ ...scenario, checkpoints: ["loaded", "loaded"] })).toThrow(
    "unique",
  );
  expect(() => defineScenario({ ...scenario, revision: "" })).toThrow("identifier");
});

it("joins only verified catalog stories from public index v5 and excludes source paths", () => {
  const catalog = createScenarioCatalog([
    { storyId: "billing--success", scenario: describeScenario(scenario) },
  ]);
  const entry = {
    id: "billing--success",
    type: "story",
    title: "Billing",
    name: "Success",
    importPath: "/private/source.tsx",
  };
  const resolved = resolveScenarioCatalog(catalog, {
    v: 5,
    entries: { "billing--success": entry },
  });
  expect(resolved.entries[0]).toMatchObject({ title: "Billing", name: "Success" });
  expect(JSON.stringify(resolved)).not.toContain("/private");
  expect(() => resolveScenarioCatalog(catalog, { v: 4, entries: {} })).toThrow("version 5");
  expect(() => resolveScenarioCatalog(catalog, { v: 5, entries: {} })).toThrow("missing");
  expect(() =>
    resolveScenarioCatalog(catalog, {
      v: 5,
      entries: { "billing--success": { ...entry, type: "docs" } },
    }),
  ).toThrow("invalid");
});

it("stops a pinned capture when navigation selects another story", async () => {
  const run = await prepareScenario(scenario);
  const observed = { storyId: "another--story", execution: run.snapshot() };
  expect(
    inspectScenario(observed, { ...target, executionId: run.snapshot().executionId }),
  ).toMatchObject({ status: "blocked", code: "wrong-story" });
  await run.dispose();
});

it("omits extra Storybook entry fields that structural typing permits", () => {
  const entry = {
    storyId: "billing--success",
    scenario: describeScenario(scenario),
    importPath: "/private/source.tsx",
    fixture: "private-payload",
  };
  const catalog = createScenarioCatalog([entry]);
  expect(catalog.entries[0]).toEqual({ storyId: entry.storyId, scenario: entry.scenario });
  expect(JSON.stringify(catalog)).not.toContain("private");
});
