import { describe, expect, it } from "vitest";
import { defineScenario } from "../src/index.js";
import { installScenariosBridge, withScenario } from "../src/storybook.js";

function scenario() {
  return defineScenario({
    id: "example.success",
    seed: "fixed",
    now: "2026-01-01T00:00:00.000Z",
    fixtures: () => ({ values: ["original"] }),
  });
}
function context(id: string) {
  return {
    id,
    get canvasElement(): never {
      throw new Error("Canvas is unused in this lifecycle unit test");
    },
  };
}
function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

describe("Storybook lifecycle", () => {
  it("creates fresh fixture data and clears access after teardown", async () => {
    const story = withScenario(scenario());
    const bridge = installScenariosBridge();
    const cleanup = await story.annotations.beforeEach({ id: "one" });
    const first = story.current();
    first.fixtures.values.push("changed");
    expect(bridge.getActive()?.execution.status).toBe("running");
    await story.annotations.play(context("one"));
    expect(bridge.getActive()?.execution.status).toBe("ready");
    await cleanup();
    expect(() => story.current()).toThrow("not active");
    expect(bridge.getActive()).toBeNull();
    const secondCleanup = await story.annotations.beforeEach({ id: "one" });
    expect(story.current().fixtures.values).toEqual(["original"]);
    expect(story.current().snapshot().executionId).not.toBe(first.snapshot().executionId);
    await secondCleanup();
  });
  it("disposes adapter setup failures and retains detached failure evidence", async () => {
    let disposed = false;
    const story = withScenario(scenario(), {
      setup: (run) => {
        run.onDispose(() => {
          disposed = true;
        });
        throw new Error("setup evidence");
      },
    });
    await expect(story.annotations.beforeEach({ id: "failure" })).rejects.toThrow("setup evidence");
    const bridge = installScenariosBridge();
    expect(disposed).toBe(true);
    expect(() => story.current()).toThrow("not active");
    expect(bridge.getActive()?.execution).toMatchObject({ status: "failed", disposed: true });
    expect(bridge.getActive()?.execution.diagnostics).toContainEqual({
      code: "storybook-setup-failed",
      message: "setup evidence",
    });
  });
  it("retains core setup failure evidence", async () => {
    const story = withScenario(
      defineScenario({
        ...scenario(),
        setup: () => {
          throw new Error("core evidence");
        },
      }),
    );
    await expect(story.annotations.beforeEach({ id: "core-failure" })).rejects.toThrow(
      "core evidence",
    );
    expect(installScenariosBridge().getActive()?.execution).toMatchObject({
      status: "failed",
      disposed: true,
      diagnostics: [{ code: "setup", message: "core evidence" }],
    });
  });
  it("bounds stuck adapter setup so a subsequent story can proceed", async () => {
    const stuck = withScenario(scenario(), {
      setupTimeoutMs: 15,
      setup: () => new Promise<void>(() => {}),
    });
    await expect(stuck.annotations.beforeEach({ id: "stuck" })).rejects.toThrow("timed out");
    const next = withScenario(scenario());
    const cleanup = await next.annotations.beforeEach({ id: "next" });
    expect(next.current().snapshot().status).toBe("running");
    await cleanup();
  });
  it("cleans play failures and retains their original message", async () => {
    const story = withScenario(scenario(), {
      play: () => {
        throw new Error("play evidence");
      },
    });
    const cleanup = await story.annotations.beforeEach({ id: "play-failure" });
    await expect(story.annotations.play(context("play-failure"))).rejects.toThrow("play evidence");
    expect(() => story.current()).toThrow("not active");
    expect(installScenariosBridge().getActive()?.execution.diagnostics).toContainEqual({
      code: "storybook-play-failed",
      message: "play evidence",
    });
    await cleanup();
  });
  it("rejects a superseded preparation and serializes ownership", async () => {
    const gate = deferred();
    const started = deferred();
    let disposed = false;
    const first = withScenario(scenario(), {
      setup: async (run) => {
        run.onDispose(() => {
          disposed = true;
        });
        started.release();
        await gate.promise;
      },
    });
    const pending = first.annotations.beforeEach({ id: "first" });
    const rejected = expect(pending).rejects.toThrow("superseded");
    await started.promise;
    const next = withScenario(scenario());
    const nextPending = next.annotations.beforeEach({ id: "next" });
    gate.release();
    await rejected;
    const cleanup = await nextPending;
    expect(disposed).toBe(true);
    expect(() => first.current()).toThrow("not active");
    expect(installScenariosBridge().getActive()?.storyId).toBe("next");
    await cleanup();
  });
  it("prevents old in-flight play from marking a new execution ready", async () => {
    const gate = deferred();
    const started = deferred();
    const first = withScenario(scenario(), {
      play: async () => {
        started.release();
        await gate.promise;
      },
    });
    const cleanup = await first.annotations.beforeEach({ id: "first" });
    const playing = first.annotations.play(context("first"));
    const rejected = expect(playing).rejects.toThrow("aborted");
    await started.promise;
    const next = withScenario(scenario());
    const nextCleanup = await next.annotations.beforeEach({ id: "next" });
    await rejected;
    gate.release();
    expect(next.current().snapshot().status).toBe("running");
    await cleanup();
    expect(installScenariosBridge().getActive()?.storyId).toBe("next");
    await nextCleanup();
  });
});
