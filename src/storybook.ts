import {
  describeScenario,
  type Execution,
  type ExecutionSnapshot,
  prepareScenario,
  type ScenarioDefinition,
  ScenarioPreparationError,
} from "./index.js";

export interface CanvasContext {
  id: string;
  canvasElement: HTMLElement;
}
export interface ActiveSnapshot {
  storyId: string;
  execution: ExecutionSnapshot;
}
export interface ScenariosBridge {
  readonly protocolVersion: 1;
  getActive(): ActiveSnapshot | null;
}
declare global {
  interface Window {
    __JUXTAPOSE_SCENARIOS__?: ScenariosBridge;
  }
}
interface ActiveOwner {
  snapshot(): ActiveSnapshot;
  dispose(): Promise<void>;
}
let active: ActiveOwner | undefined;
let lastFailure: ActiveSnapshot | undefined;
let transition = Promise.resolve();
let generation = 0;

/** A read-only, versioned bridge; fixtures never cross this boundary. */
export function installScenariosBridge(): ScenariosBridge {
  const bridge: ScenariosBridge = Object.freeze({
    protocolVersion: 1,
    getActive: () => structuredClone(active?.snapshot() ?? lastFailure ?? null),
  });
  if (typeof window !== "undefined") window.__JUXTAPOSE_SCENARIOS__ = bridge;
  return bridge;
}
export interface WithScenarioOptions<T extends object> {
  setup?: (execution: Execution<T>) => void | Promise<void>;
  play?: (context: CanvasContext, execution: Execution<T>) => void | Promise<void>;
  setupTimeoutMs?: number;
  playTimeoutMs?: number;
}
function timeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error("Storybook timeouts must be positive finite numbers");
  return value;
}
function bounded(
  work: () => void | Promise<void>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => finish(() => reject(new Error("Storybook execution aborted")));
    const timer = setTimeout(
      () => finish(() => reject(new Error(`Storybook callback timed out after ${timeoutMs}ms`))),
      timeoutMs,
    );
    function finish(callback: () => void): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      callback();
    }
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) throw new Error("Storybook execution aborted");
        return work();
      })
      .then(
        () => finish(resolve),
        (error) => finish(() => reject(error)),
      );
  });
}

/** Spread annotations into a CSF story. Concurrent Docs canvases are unsupported. */
export function withScenario<T extends object>(
  scenario: ScenarioDefinition<T>,
  options: WithScenarioOptions<T> = {},
) {
  let execution: Execution<T> | undefined;
  let own: ActiveOwner | undefined;
  let storyId: string | undefined;
  const setupTimeout = timeout(options.setupTimeoutMs ?? 5000);
  const playTimeout = timeout(options.playTimeoutMs ?? 5000);
  function current(): Execution<T> {
    if (!execution || execution.signal.aborted || !own || active !== own)
      throw new Error("Juxtapose Scenarios execution is not active; access it after beforeEach");
    return execution;
  }
  async function beforeEach(context: { id: string; viewMode?: string }) {
    if (context.viewMode === "docs")
      throw new Error(
        "Juxtapose Scenarios supports isolated story canvases, not concurrent Docs stories",
      );
    const ticket = ++generation;
    const prepare = transition.then(async () => {
      if (ticket !== generation) throw new Error("Storybook preparation superseded");
      await active?.dispose();
      if (ticket !== generation) throw new Error("Storybook preparation superseded");
      let run: Execution<T>;
      try {
        run = await prepareScenario(scenario);
      } catch (error) {
        if (error instanceof ScenarioPreparationError && ticket === generation)
          lastFailure = { storyId: context.id, execution: structuredClone(error.snapshot) };
        throw error;
      }
      const owner: ActiveOwner = {
        snapshot: () => ({ storyId: context.id, execution: run.snapshot() }),
        async dispose() {
          await run.dispose();
          if (active === owner) {
            if (run.snapshot().status === "failed") lastFailure = owner.snapshot();
            active = undefined;
          }
          if (execution === run) {
            execution = undefined;
            own = undefined;
          }
        },
      };
      if (ticket !== generation) {
        await owner.dispose();
        throw new Error("Storybook preparation superseded");
      }
      execution = run;
      own = owner;
      storyId = context.id;
      active = owner;
      lastFailure = undefined;
      installScenariosBridge();
      try {
        await bounded(() => options.setup?.(run), run.signal, setupTimeout);
        if (ticket !== generation) throw new Error("Storybook preparation superseded");
        if (run.snapshot().status === "failed") throw new Error("Scenario setup failed");
        run.start();
      } catch (error) {
        run.fail("storybook-setup-failed", error instanceof Error ? error.message : String(error));
        await owner.dispose();
        throw error;
      }
      return () => owner.dispose();
    });
    transition = prepare.then(
      () => {},
      () => {},
    );
    return prepare;
  }
  async function play(context: CanvasContext) {
    const run = current();
    const owner = own;
    if (storyId !== context.id) throw new Error("Story changed before scenario play");
    try {
      await bounded(() => options.play?.(context, run), run.signal, playTimeout);
      await run.checkpoint("play-complete", () => true);
    } catch (error) {
      run.fail("storybook-play-failed", error instanceof Error ? error.message : String(error));
      await owner?.dispose();
      throw error;
    }
  }
  return {
    annotations: {
      parameters: { juxtaposeScenarios: describeScenario(scenario) },
      beforeEach,
      play,
    },
    current,
  };
}
