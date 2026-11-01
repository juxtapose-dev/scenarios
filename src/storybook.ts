import {
  describeScenario,
  type Execution,
  type ExecutionSnapshot,
  loadScenarioFixtures,
  prepareScenario,
  type ScenarioDefinition,
  ScenarioPreparationError,
} from "./index.js";

/** Standard Storybook loaders with typed, per-render access; safe for inline Docs. */
export function withFixtures<T extends object>(scenario: ScenarioDefinition<T>) {
  if (scenario.setup !== undefined)
    throw new Error("Fixture-only loading cannot run setup; use withScenario");
  const values = new WeakMap<object, T>();
  async function load() {
    const fixtures = await loadScenarioFixtures(scenario);
    values.set(fixtures, fixtures);
    return { juxtaposeScenarioFixtures: fixtures };
  }
  function read(context: { readonly loaded: Readonly<Record<string, unknown>> }): T {
    const value = context.loaded.juxtaposeScenarioFixtures;
    const fixtures = value !== null && typeof value === "object" ? values.get(value) : undefined;
    if (fixtures === undefined)
      throw new Error(
        "Fixture data is missing or belongs to another loader; include this helper's annotations.loaders",
      );
    return fixtures;
  }
  return {
    annotations: {
      parameters: { juxtaposeScenarios: describeScenario(scenario) },
      loaders: [load],
    },
    read,
  };
}

export interface CanvasContext {
  id: string;
  canvasElement: HTMLElement;
  abortSignal: AbortSignal;
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
  sourceRevision?: string;
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
  interface Owner extends ActiveOwner {
    readonly run: Execution<T>;
  }
  interface Binding {
    readonly storyId: string;
    readonly signal: AbortSignal;
    readonly preparation: Promise<Owner>;
    cleanupRegistered: boolean;
    ended: boolean;
    playing?: Promise<void>;
  }
  const bindings = new WeakMap<AbortSignal, Binding>();
  let own: Owner | undefined;
  const setupTimeout = timeout(options.setupTimeoutMs ?? 5000);
  const playTimeout = timeout(options.playTimeoutMs ?? 5000);
  function current(): Execution<T> {
    if (!own || own.run.signal.aborted || active !== own)
      throw new Error("Juxtapose Scenarios execution is not active; access it after beforeEach");
    return own.run;
  }
  function requireActive(binding: Binding, owner: Owner): Execution<T> {
    if (binding.signal.aborted || owner.run.signal.aborted || active !== owner)
      throw new Error(
        "Scenario mount is stale or aborted; remount the story for a fresh execution",
      );
    if (owner.run.snapshot().status === "failed")
      throw new Error("Scenario execution failed; remount the story for a fresh execution");
    return owner.run;
  }
  async function beforeEach(context: { id: string; viewMode?: string; abortSignal: AbortSignal }) {
    if (context.viewMode === "docs")
      throw new Error(
        "Juxtapose Scenarios supports isolated story canvases, not concurrent Docs stories; use withFixtures for data-only Docs",
      );
    if (!context.abortSignal || context.abortSignal.aborted)
      throw new Error("Scenario mount is aborted or missing its signal; remount the story");
    const existing = bindings.get(context.abortSignal);
    if (existing) {
      if (existing.ended)
        throw new Error("Scenario execution ended; remount the story for a fresh execution");
      if (existing.storyId !== context.id)
        throw new Error("A mount signal cannot be shared by different stories");
      const owner = await existing.preparation;
      requireActive(existing, owner);
      if (existing.cleanupRegistered) return;
      existing.cleanupRegistered = true;
      return () => owner.dispose();
    }
    const ticket = ++generation;
    const binding: Binding = {
      storyId: context.id,
      signal: context.abortSignal,
      cleanupRegistered: false,
      ended: false,
      preparation: transition.then(async () => {
        if (ticket !== generation) throw new Error("Storybook preparation superseded");
        if (binding.signal.aborted) throw new Error("Scenario mount aborted");
        await active?.dispose();
        if (ticket !== generation) throw new Error("Storybook preparation superseded");
        if (binding.signal.aborted) throw new Error("Scenario mount aborted");
        let run: Execution<T>;
        try {
          run = await prepareScenario(scenario, {
            signal: binding.signal,
            ...(options.sourceRevision !== undefined
              ? { sourceRevision: options.sourceRevision }
              : {}),
          });
        } catch (error) {
          if (
            error instanceof ScenarioPreparationError &&
            ticket === generation &&
            !binding.signal.aborted
          )
            lastFailure = { storyId: context.id, execution: structuredClone(error.snapshot) };
          throw error;
        }
        const owner: Owner = {
          run,
          snapshot: () => ({ storyId: context.id, execution: run.snapshot() }),
          async dispose() {
            binding.ended = true;
            await run.dispose();
            if (active === owner) {
              if (run.snapshot().status === "failed") lastFailure = owner.snapshot();
              active = undefined;
            }
            if (own === owner) own = undefined;
          },
        };
        if (ticket !== generation || binding.signal.aborted || run.signal.aborted) {
          await owner.dispose();
          throw new Error(
            binding.signal.aborted ? "Scenario mount aborted" : "Storybook preparation superseded",
          );
        }
        const abort = () => {
          void owner.dispose();
        };
        binding.signal.addEventListener("abort", abort, { once: true });
        run.onDispose(() => binding.signal.removeEventListener("abort", abort));
        own = owner;
        active = owner;
        lastFailure = undefined;
        installScenariosBridge();
        try {
          if (run.snapshot().status === "failed") throw new Error("Scenario setup failed");
          await bounded(() => options.setup?.(run), run.signal, setupTimeout);
          if (ticket !== generation) throw new Error("Storybook preparation superseded");
          requireActive(binding, owner);
          if (run.snapshot().status === "failed") throw new Error("Scenario setup failed");
          run.start();
        } catch (error) {
          run.fail(
            "storybook-setup-failed",
            error instanceof Error ? error.message : String(error),
          );
          await owner.dispose();
          throw error;
        }
        return owner;
      }),
    };
    bindings.set(context.abortSignal, binding);
    transition = binding.preparation.then(
      () => {},
      () => {
        binding.ended = true;
      },
    );
    const owner = await binding.preparation;
    requireActive(binding, owner);
    if (binding.cleanupRegistered) return;
    binding.cleanupRegistered = true;
    return () => owner.dispose();
  }
  async function play(context: CanvasContext) {
    const binding = bindings.get(context.abortSignal);
    if (!binding || binding.storyId !== context.id || binding.signal.aborted)
      throw new Error(
        "Scenario mount is stale or aborted; remount the story for a fresh execution",
      );
    const owner = await binding.preparation;
    const run = requireActive(binding, owner);
    if (!binding.playing) {
      binding.playing = (async () => {
        try {
          await bounded(() => options.play?.(context, run), run.signal, playTimeout);
          requireActive(binding, owner);
          await run.checkpoint("play-complete", () => true);
        } catch (error) {
          run.fail("storybook-play-failed", error instanceof Error ? error.message : String(error));
          await owner.dispose();
          throw error;
        }
      })();
    }
    return binding.playing;
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
