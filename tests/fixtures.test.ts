import { describe, expect, it } from "vitest";
import { defineFactory, defineScenario, loadScenarioFixtures } from "../src/index.js";
import { installScenariosBridge, withFixtures } from "../src/storybook.js";

const customer = defineFactory({
  version: "1",
  build: ({ faker }) => ({ name: faker.person.fullName(), invoices: [42] }),
});
const scenario = defineScenario({
  id: "fixtures/customer",
  seed: "fixture-only-v1",
  now: "2026-01-01T00:00:00.000Z",
  fixtures: ({ factory }) => ({ customer: factory("primary", customer) }),
});

describe("fixture-only loading", () => {
  it("returns reproducible, independently mutable data without owning the canvas", async () => {
    const before = installScenariosBridge().getActive();
    const [first, second] = await Promise.all([
      loadScenarioFixtures(scenario),
      loadScenarioFixtures(scenario),
    ]);
    expect(first).toEqual(second);
    first.customer.invoices.push(7);
    expect(second.customer.invoices).toEqual([42]);
    expect(installScenariosBridge().getActive()).toEqual(before);
  });
  it("rejects setup before running it rather than disposing resources before render", async () => {
    let called = false;
    const mounted = defineScenario({
      ...scenario,
      setup: () => {
        called = true;
      },
    });
    await expect(loadScenarioFixtures(mounted)).rejects.toThrow("cannot run setup");
    expect(() => withFixtures(mounted)).toThrow("cannot run setup");
    expect(called).toBe(false);
  });
  it("preserves fixture validation and errors", async () => {
    await expect(
      loadScenarioFixtures(
        defineScenario({
          id: scenario.id,
          seed: scenario.seed,
          now: scenario.now,
          fixtures: () => ({ invalid: new Map<string, string>() }),
        }),
      ),
    ).rejects.toThrow("Custom fixture class");
  });
});

it("reads the matching loader's data without sharing another render's instance", async () => {
  const data = withFixtures(scenario);
  const other = withFixtures(scenario);
  const load = data.annotations.loaders[0];
  const loadOther = other.annotations.loaders[0];
  if (!load || !loadOther) throw new Error("Missing fixture loader");
  const [first, second, foreign] = await Promise.all([load(), load(), loadOther()]);
  const firstFixtures = data.read({ loaded: first });
  const secondFixtures = data.read({ loaded: second });
  firstFixtures.customer.invoices.push(7);
  expect(secondFixtures.customer.invoices).toEqual([42]);
  expect(first.juxtaposeScenarioFixtures).toBe(firstFixtures);
  expect(data.annotations.parameters.juxtaposeScenarios.scenarioId).toBe(scenario.id);
  expect(() => data.read({ loaded: {} })).toThrow("missing or belongs to another loader");
  expect(() => data.read({ loaded: foreign })).toThrow("missing or belongs to another loader");
  expect(() =>
    data.read({ loaded: { juxtaposeScenarioFixtures: structuredClone(firstFixtures) } }),
  ).toThrow("missing or belongs to another loader");
});
