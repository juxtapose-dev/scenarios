import { afterEach, expect, it, vi } from "vitest";
import { defineScenario, prepareScenario, ScenarioPreparationError } from "../src/index.js";

const loading = vi.hoisted(() => {
  let started = () => {};
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  return { requested, started };
});
vi.mock("@faker-js/faker", () => {
  loading.started();
  return new Promise<never>(() => {});
});
afterEach(() => vi.useRealTimers());

function scenario(build: () => { value: string }) {
  return defineScenario({
    id: "generator/loading",
    seed: "fixed",
    now: "2026-01-01T00:00:00.000Z",
    fixtures: build,
  });
}
it("aborts preparation while the generator module is still loading", async () => {
  const build = vi.fn(() => ({ value: "unused" }));
  const controller = new AbortController();
  const pending = prepareScenario(scenario(build), { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({
    snapshot: {
      status: "failed",
      disposed: true,
      diagnostics: [{ code: "fixtures", message: "Execution aborted" }],
    },
  });
  await loading.requested;
  controller.abort();
  await rejected;
  expect(build).not.toHaveBeenCalled();
});
it("bounds a stalled generator load and preserves revision diagnostics", async () => {
  vi.useFakeTimers();
  const build = vi.fn(() => ({ value: "unused" }));
  const pending = prepareScenario(scenario(build), { sourceRevision: "stalled-build" });
  const rejected = expect(pending).rejects.toMatchObject({
    name: ScenarioPreparationError.name,
    snapshot: {
      sourceRevision: "stalled-build",
      disposed: true,
      factories: [],
      diagnostics: [{ code: "fixtures", message: "Timed out after 5000ms" }],
    },
  });
  await vi.advanceTimersByTimeAsync(5000);
  await rejected;
  expect(build).not.toHaveBeenCalled();
});
