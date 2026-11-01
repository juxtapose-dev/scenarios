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
function mount(id: string) {
  const controller = new AbortController();
  return { id, abortSignal: controller.signal, abort: () => controller.abort() };
}
function context(mounted: { id: string; abortSignal: AbortSignal }) {
  return {
    id: mounted.id,
    abortSignal: mounted.abortSignal,
    get canvasElement(): never {
      throw new Error("Canvas is unused in this lifecycle unit test");
    },
  };
}
async function teardown(cleanup: (() => void | Promise<void>) | undefined) {
  if (cleanup) await cleanup();
}
function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

describe("Storybook lifecycle", () => {
  it("creates fresh fixture data on a new mount and clears access after teardown", async () => {
    const story = withScenario(scenario());
    const bridge = installScenariosBridge();
    const mounted = mount("one");
    const cleanup = await story.annotations.beforeEach(mounted);
    expect(cleanup).toBeTypeOf("function");
    const first = story.current();
    first.fixtures.values.push("changed");
    expect(bridge.getActive()?.execution.status).toBe("running");
    await story.annotations.play(context(mounted));
    expect(bridge.getActive()?.execution.status).toBe("ready");
    await teardown(cleanup);
    expect(() => story.current()).toThrow("not active");
    expect(bridge.getActive()).toBeNull();
    const secondCleanup = await story.annotations.beforeEach(mount("one"));
    expect(story.current().fixtures.values).toEqual(["original"]);
    expect(story.current().snapshot().executionId).not.toBe(first.snapshot().executionId);
    await teardown(secondCleanup);
  });

  it("preserves owner, ready status and local data across args hooks with the same signal", async () => {
    let setups = 0;
    let disposals = 0;
    const story = withScenario(scenario(), {
      setup: (run) => {
        setups += 1;
        run.onDispose(() => {
          disposals += 1;
        });
      },
    });
    const mounted = mount("args");
    const cleanup = await story.annotations.beforeEach(mounted);
    const run = story.current();
    run.fixtures.values.push("changed");
    await story.annotations.play(context(mounted));
    const repeatedCleanup = await story.annotations.beforeEach({
      id: mounted.id,
      abortSignal: mounted.abortSignal,
    });
    expect(repeatedCleanup).toBeUndefined();
    expect(setups).toBe(1);
    expect(story.current()).toBe(run);
    expect(run.fixtures.values).toEqual(["original", "changed"]);
    expect(run.snapshot().status).toBe("ready");
    await teardown(cleanup);
    expect(disposals).toBe(1);
  });

  it("deduplicates concurrent preparation for the same mount signal", async () => {
    const started = deferred();
    const gate = deferred();
    let setups = 0;
    let disposals = 0;
    const story = withScenario(scenario(), {
      setup: async (run) => {
        setups += 1;
        run.onDispose(() => {
          disposals += 1;
        });
        started.release();
        await gate.promise;
      },
    });
    const mounted = mount("concurrent");
    const first = story.annotations.beforeEach(mounted);
    await started.promise;
    const second = story.annotations.beforeEach({
      id: mounted.id,
      abortSignal: mounted.abortSignal,
    });
    gate.release();
    const cleanups = await Promise.all([first, second]);
    expect(cleanups.filter((cleanup) => cleanup !== undefined)).toHaveLength(1);
    expect(setups).toBe(1);
    for (const cleanup of cleanups) await teardown(cleanup);
    expect(disposals).toBe(1);
  });

  it("reuses in-flight and completed play work for the same mounted execution", async () => {
    const gate = deferred();
    const started = deferred();
    let plays = 0;
    const story = withScenario(scenario(), {
      play: async (_context, run) => {
        plays += 1;
        run.fixtures.values.push("played");
        started.release();
        await gate.promise;
      },
    });
    const mounted = mount("play-once");
    const cleanup = await story.annotations.beforeEach(mounted);
    const first = story.annotations.play(context(mounted));
    await started.promise;
    const argsCleanup = await story.annotations.beforeEach({
      id: mounted.id,
      abortSignal: mounted.abortSignal,
    });
    expect(argsCleanup).toBeUndefined();
    const second = story.annotations.play(context(mounted));
    gate.release();
    await Promise.all([first, second]);
    await story.annotations.play(context(mounted));
    expect(plays).toBe(1);
    expect(story.current().fixtures.values).toEqual(["original", "played"]);
    expect(story.current().snapshot().checkpoints).toHaveLength(1);
    await teardown(cleanup);
  });

  it("rejects stale play for the same story ID before invoking user callbacks", async () => {
    let plays = 0;
    const story = withScenario(scenario(), {
      play: (_context, run) => {
        plays += 1;
        run.fixtures.values.push("played");
      },
    });
    const oldMount = mount("same-id");
    const oldCleanup = await story.annotations.beforeEach(oldMount);
    const oldRun = story.current();
    oldMount.abort();
    const replacement = mount("same-id");
    const cleanup = await story.annotations.beforeEach(replacement);
    const run = story.current();
    await expect(story.annotations.play(context(oldMount))).rejects.toThrow();
    expect(plays).toBe(0);
    expect(oldRun.signal.aborted).toBe(true);
    expect(run.fixtures.values).toEqual(["original"]);
    expect(run.snapshot().status).toBe("running");
    await teardown(oldCleanup);
    expect(story.current()).toBe(run);
    await story.annotations.play(context(replacement));
    expect(plays).toBe(1);
    await teardown(cleanup);
  });

  it("rejects an already-aborted mount without running setup", async () => {
    let setups = 0;
    const story = withScenario(scenario(), {
      setup: () => {
        setups += 1;
      },
    });
    const mounted = mount("already-aborted");
    mounted.abort();
    await expect(story.annotations.beforeEach(mounted)).rejects.toThrow(/abort|remount/i);
    expect(setups).toBe(0);
    expect(() => story.current()).toThrow("not active");
  });

  it("requires a remount after disposal instead of replacing the same signal binding", async () => {
    const story = withScenario(scenario());
    const mounted = mount("disposed");
    const cleanup = await story.annotations.beforeEach(mounted);
    const run = story.current();
    await teardown(cleanup);
    await expect(story.annotations.beforeEach(mounted)).rejects.toThrow(/remount/i);
    expect(run.snapshot().disposed).toBe(true);
    expect(() => story.current()).toThrow("not active");
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
    const mounted = mount("failure");
    await expect(story.annotations.beforeEach(mounted)).rejects.toThrow("setup evidence");
    const bridge = installScenariosBridge();
    expect(disposed).toBe(true);
    expect(() => story.current()).toThrow("not active");
    expect(bridge.getActive()?.execution).toMatchObject({ status: "failed", disposed: true });
    expect(bridge.getActive()?.execution.diagnostics).toContainEqual({
      code: "storybook-setup-failed",
      message: "setup evidence",
    });
    await expect(story.annotations.beforeEach(mounted)).rejects.toThrow(/remount/i);
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
    await expect(story.annotations.beforeEach(mount("core-failure"))).rejects.toThrow(
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
    await expect(stuck.annotations.beforeEach(mount("stuck"))).rejects.toThrow("timed out");
    const next = withScenario(scenario());
    const cleanup = await next.annotations.beforeEach(mount("next"));
    expect(next.current().snapshot().status).toBe("running");
    await teardown(cleanup);
  });

  it("cleans play failures and requires a remount for args hooks", async () => {
    let plays = 0;
    const story = withScenario(scenario(), {
      play: () => {
        plays += 1;
        throw new Error("play evidence");
      },
    });
    const mounted = mount("play-failure");
    const cleanup = await story.annotations.beforeEach(mounted);
    await expect(story.annotations.play(context(mounted))).rejects.toThrow("play evidence");
    expect(() => story.current()).toThrow("not active");
    expect(installScenariosBridge().getActive()?.execution.diagnostics).toContainEqual({
      code: "storybook-play-failed",
      message: "play evidence",
    });
    await expect(story.annotations.beforeEach(mounted)).rejects.toThrow(/remount/i);
    await expect(story.annotations.play(context(mounted))).rejects.toThrow();
    expect(plays).toBe(1);
    await teardown(cleanup);
  });

  it("aborts delayed adapter setup promptly and disposes its execution", async () => {
    const started = deferred();
    const disposed = deferred();
    const gate = deferred();
    const story = withScenario(scenario(), {
      setupTimeoutMs: 10_000,
      setup: async (run) => {
        run.onDispose(() => {
          disposed.release();
        });
        started.release();
        await gate.promise;
      },
    });
    const mounted = mount("aborted-setup");
    const pending = story.annotations.beforeEach(mounted);
    const rejected = expect(pending).rejects.toThrow(/abort|remount/i);
    await started.promise;
    const run = story.current();
    mounted.abort();
    await rejected;
    await disposed.promise;
    expect(run.signal.aborted).toBe(true);
    expect(run.snapshot().disposed).toBe(true);
    expect(() => story.current()).toThrow("not active");
    gate.release();
  });

  it("aborts delayed core setup and releases preparation for the next story", async () => {
    const started = deferred();
    const disposed = deferred();
    const gate = deferred();
    let executionSignal: AbortSignal | undefined;
    const story = withScenario(
      defineScenario({
        ...scenario(),
        setup: async (run) => {
          executionSignal = run.signal;
          run.onDispose(() => {
            disposed.release();
          });
          started.release();
          await gate.promise;
        },
      }),
    );
    const mounted = mount("aborted-core-setup");
    const pending = story.annotations.beforeEach(mounted);
    const rejected = expect(pending).rejects.toThrow(/abort/i);
    await started.promise;
    mounted.abort();
    await rejected;
    await disposed.promise;
    expect(executionSignal?.aborted).toBe(true);
    const next = withScenario(scenario());
    const cleanup = await next.annotations.beforeEach(mount("after-core-abort"));
    expect(next.current().snapshot().status).toBe("running");
    gate.release();
    await teardown(cleanup);
  });

  it("rejects superseded preparation without allowing old cleanup to dispose the replacement", async () => {
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
    const pending = first.annotations.beforeEach(mount("first"));
    const rejected = expect(pending).rejects.toThrow(/superseded|abort/i);
    await started.promise;
    const next = withScenario(scenario());
    const nextPending = next.annotations.beforeEach(mount("next"));
    gate.release();
    await rejected;
    const cleanup = await nextPending;
    expect(disposed).toBe(true);
    expect(() => first.current()).toThrow("not active");
    expect(installScenariosBridge().getActive()?.storyId).toBe("next");
    await teardown(cleanup);
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
    const mounted = mount("first");
    const cleanup = await first.annotations.beforeEach(mounted);
    const playing = first.annotations.play(context(mounted));
    const rejected = expect(playing).rejects.toThrow("aborted");
    await started.promise;
    const next = withScenario(scenario());
    const nextCleanup = await next.annotations.beforeEach(mount("next"));
    await rejected;
    gate.release();
    expect(next.current().snapshot().status).toBe("running");
    await teardown(cleanup);
    expect(installScenariosBridge().getActive()?.storyId).toBe("next");
    await teardown(nextCleanup);
  });
});
