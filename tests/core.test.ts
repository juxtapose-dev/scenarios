import { describe, expect, it } from "vitest";
import {
  defineFactory,
  defineScenario,
  describeScenario,
  prepareScenario,
  resolveExperiments,
  resolveFlags,
} from "../src/index.js";

const person = defineFactory({
  version: "1",
  build: ({ faker, now, id }) => ({
    name: faker.person.fullName(),
    id: id("person"),
    date: now.toISOString(),
    nested: { active: true },
  }),
});
function scenario(seed = "fixed") {
  return defineScenario({
    id: "customer.success",
    seed,
    now: "2026-01-01T00:00:00.000Z",
    fixtures: (context) => ({ person: context.factory("person", person) }),
  });
}

describe("deterministic fixtures", () => {
  it("reproduces data, separates executions, and changes with seeds", async () => {
    const first = await prepareScenario(scenario());
    const second = await prepareScenario(scenario());
    const third = await prepareScenario(scenario("other"));
    expect(first.fixtures).toEqual(second.fixtures);
    expect(first.snapshot().executionId).not.toBe(second.snapshot().executionId);
    expect(third.fixtures).not.toEqual(first.fixtures);
    first.fixtures.person.nested.active = false;
    expect(second.fixtures.person.nested.active).toBe(true);
    expect(first.fixtures.person.date).toBe("2026-01-01T00:00:00.000Z");
    await Promise.all([first.dispose(), second.dispose(), third.dispose()]);
  });
  it("isolates fixture streams from construction order", async () => {
    const first = await prepareScenario(scenario());
    const second = await prepareScenario(
      defineScenario({
        ...scenario(),
        fixtures: (context) => {
          context.factory("unrelated", person);
          return { person: context.factory("person", person) };
        },
      }),
    );
    expect(second.fixtures).toEqual(first.fixtures);
    await first.dispose();
    await second.dispose();
  });
  it("rejects duplicate keys and invalid declarations", async () => {
    await expect(
      prepareScenario(
        defineScenario({
          ...scenario(),
          fixtures: (context) => {
            context.factory("person", person);
            return { person: context.factory("person", person) };
          },
        }),
      ),
    ).rejects.toThrow("Duplicate");
    expect(() => defineScenario({ ...scenario(), now: "2026-02-30T00:00:00.000Z" })).toThrow("ISO");
    expect(() => defineScenario({ ...scenario(), environment: { invalid: Number.NaN } })).toThrow(
      "finite",
    );
  });
  it("omits fixture bodies and returns detached snapshots", async () => {
    const execution = await prepareScenario(scenario());
    const snapshot = execution.snapshot();
    expect(JSON.stringify(snapshot)).not.toContain(execution.fixtures.person.name);
    expect(snapshot.fixtureKeys).toEqual(["person"]);
    expect(JSON.parse(JSON.stringify(describeScenario(scenario())))).toEqual(snapshot.descriptor);
    await execution.dispose();
  });
});
describe("execution lifecycle", () => {
  it("checks readiness then latches late failures through disposal", async () => {
    const execution = await prepareScenario(scenario());
    execution.start();
    await execution.checkpoint("loaded", () => true);
    expect(execution.snapshot().status).toBe("ready");
    execution.fail("network", "unexpected API");
    await execution.dispose();
    expect(execution.snapshot().status).toBe("failed");
    expect(execution.snapshot().disposed).toBe(true);
  });
  it("bounds checkpoints and does not retry thrown errors", async () => {
    const execution = await prepareScenario(scenario());
    let calls = 0;
    await expect(
      execution.checkpoint("error", () => {
        calls++;
        throw new Error("original");
      }),
    ).rejects.toThrow("original");
    expect(calls).toBe(1);
    await execution.dispose();
    const waiting = await prepareScenario(scenario());
    await expect(
      waiting.checkpoint("never", () => false, { timeoutMs: 20, intervalMs: 2 }),
    ).rejects.toThrow("Timed out");
    expect(waiting.snapshot().status).toBe("failed");
    await waiting.dispose();
  });
  it("aborts pending checkpoints and prevents stale readiness", async () => {
    const execution = await prepareScenario(scenario());
    const pending = execution.checkpoint("wait", () => new Promise<boolean>(() => {}));
    const assertion = expect(pending).rejects.toThrow("aborted");
    await execution.dispose();
    await assertion;
    expect(execution.snapshot().status).toBe("disposed");
  });
  it("runs every cleanup once in reverse order and preserves failures", async () => {
    const execution = await prepareScenario(scenario());
    const order: number[] = [];
    execution.onDispose(() => {
      order.push(1);
    });
    execution.onDispose(() => {
      order.push(2);
      throw new Error("cleanup failed");
    });
    execution.onDispose(() => {
      expect(execution.signal.aborted).toBe(true);
      order.push(3);
    });
    await Promise.all([execution.dispose(), execution.dispose()]);
    expect(order).toEqual([3, 2, 1]);
    expect(execution.snapshot().diagnostics).toEqual([
      { code: "cleanup", message: "cleanup failed" },
    ]);
  });
  it("cleans partial setup while preserving its error", async () => {
    const order: number[] = [];
    await expect(
      prepareScenario(
        defineScenario({
          ...scenario(),
          setup: (context) => {
            context.onDispose(() => {
              order.push(1);
            });
            throw new Error("setup original");
          },
        }),
      ),
    ).rejects.toThrow("setup original");
    expect(order).toEqual([1]);
  });
  it("validates assignment keys and values", () => {
    expect(resolveFlags({ beta: false }, { beta: true })).toEqual({ beta: true });
    expect(() => resolveFlags({ beta: false }, { ...{ beta: true, unknown: true } })).toThrow(
      "Unknown",
    );
  });
});

it("resolves typed treatments and rejects runtime invalid assignments", () => {
  const catalog = { checkout: ["control", "compact"] };
  expect(resolveExperiments(catalog, { checkout: "control" }, { checkout: "compact" })).toEqual({
    checkout: "compact",
  });
  expect(() => resolveExperiments(catalog, { checkout: "invalid" })).toThrow("Invalid treatment");
});

it("bounds stuck cleanup and continues reverse cleanup", async () => {
  const execution = await prepareScenario(scenario());
  let completed = false;
  execution.onDispose(() => {
    completed = true;
  });
  execution.onDispose(() => new Promise<void>(() => {}));
  await execution.dispose();
  expect(completed).toBe(true);
  expect(execution.snapshot().diagnostics).toEqual([
    { code: "cleanup", message: "Timed out after 1000ms" },
  ]);
});

it("ignores stale failures after disposal and freezes declaration metadata", async () => {
  const definition = defineScenario({ ...scenario(), environment: { viewport: { width: 800 } } });
  expect(Object.isFrozen(definition.environment?.viewport)).toBe(true);
  const execution = await prepareScenario(definition);
  await execution.dispose();
  const before = execution.snapshot();
  execution.fail("stale", "late callback");
  expect(execution.snapshot()).toEqual(before);
});

it("preserves structured-cloneable factory shapes", async () => {
  const values = defineFactory({ version: "1", build: () => ["one", "two"] });
  const execution = await prepareScenario(
    defineScenario({
      id: "array.factory",
      seed: "fixed",
      now: "2026-01-01T00:00:00.000Z",
      fixtures: (context) => ({ values: context.factory("values", values) }),
    }),
  );
  expect(Array.isArray(execution.fixtures.values)).toBe(true);
  expect(execution.fixtures.values).toEqual(["one", "two"]);
  await execution.dispose();
});

it("rejects prototype-bearing factory output before cloning", async () => {
  class Customer {
    name = "Synthetic";
    greeting() {
      return this.name;
    }
  }
  const factory = defineFactory({ version: "1", build: () => new Customer() });
  const definition = defineScenario({
    id: "invalid.class",
    seed: "fixed",
    now: "2026-01-01T00:00:00.000Z",
    fixtures: (context) => ({ customer: context.factory("customer", factory) }),
  });
  await expect(prepareScenario(definition)).rejects.toThrow("class instances");
});

it("validates directly supplied fixtures and supports plain data with Dates", async () => {
  const base = { id: "direct.fixture", seed: "fixed", now: "2026-01-01T00:00:00.000Z" };
  await expect(
    prepareScenario(
      defineScenario({ ...base, fixtures: () => ({ nested: { callback: () => true } }) }),
    ),
  ).rejects.toThrow("plain data");
  await expect(
    prepareScenario(defineScenario({ ...base, fixtures: () => ({ value: Symbol("fixture") }) })),
  ).rejects.toThrow("plain data");
  class Direct {
    value = "unsupported";
  }
  await expect(
    prepareScenario(defineScenario({ ...base, fixtures: () => ({ nested: new Direct() }) })),
  ).rejects.toThrow("class instances");
  const date = new Date(base.now);
  const execution = await prepareScenario(
    defineScenario({ ...base, fixtures: () => ({ date, optional: undefined }) }),
  );
  expect(execution.fixtures.date).toBeInstanceOf(Date);
  expect(execution.fixtures.date).not.toBe(date);
  expect(execution.fixtures.date.toISOString()).toBe(base.now);
  await execution.dispose();
});

it("rejects overlapping checkpoints so readiness cannot hide pending work", async () => {
  const execution = await prepareScenario(scenario());
  await execution.checkpoint("initial", () => true);
  let complete = () => {};
  const gate = new Promise<boolean>((resolve) => {
    complete = () => resolve(true);
  });
  const pending = execution.checkpoint("first", () => gate);
  await expect(execution.checkpoint("second", () => true)).rejects.toThrow("Concurrent");
  expect(execution.snapshot().status).not.toBe("ready");
  complete();
  await pending;
  expect(execution.snapshot().checkpoints).toEqual([
    { name: "initial", status: "ready", timeoutMs: 5000 },
    { name: "first", status: "ready", timeoutMs: 5000 },
  ]);
  await execution.dispose();
});
