import type { Faker } from "@faker-js/faker";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export interface FactoryContext {
  faker: Faker;
  now: Date;
  id(key: string): string;
}
export interface Factory<T extends object> {
  readonly version: string;
  readonly build: (context: FactoryContext) => T;
}
export interface FixtureContext {
  factory<T extends object>(key: string, factory: Factory<T>, overrides?: Partial<T>): T;
}
export interface ExecutionObserver {
  readonly signal: AbortSignal;
  fail(code: string, message: string): void;
  onDispose(callback: () => void | Promise<void>): void;
}
export interface SetupContext<T extends object> extends ExecutionObserver {
  readonly fixtures: T;
}
export interface ScenarioMetadata {
  readonly id: string;
  readonly description?: string;
  readonly seed: string;
  readonly now: string;
  readonly revision?: string;
  readonly checkpoints?: readonly string[];
  readonly environment?: Readonly<Record<string, JsonValue>>;
}
export interface ScenarioDefinition<T extends object> extends ScenarioMetadata {
  readonly fixtures: (context: FixtureContext) => T;
  readonly setup?: (context: SetupContext<T>) => void | Promise<void>;
}
export interface ScenarioDescriptor {
  readonly protocolVersion: 1;
  readonly scenarioId: string;
  readonly description: string;
  readonly seed: string;
  readonly now: string;
  readonly seedAlgorithm: "fnv1a-utf8-v1";
  readonly fakerVersion: "10.6.0";
  readonly locale: "en";
  readonly environment: Readonly<Record<string, JsonValue>>;
  readonly revision?: string;
  readonly checkpoints?: readonly string[];
}
export type ExecutionStatus =
  | "preparing"
  | "prepared"
  | "running"
  | "ready"
  | "failed"
  | "disposed";
export interface Diagnostic {
  readonly code: string;
  readonly message: string;
}
export interface CheckpointRecord {
  readonly name: string;
  readonly status: "running" | "ready" | "failed";
  readonly timeoutMs: number;
}
export interface FactoryRecord {
  readonly key: string;
  readonly version: string;
}
export interface ExecutionSnapshot {
  readonly protocolVersion: 1;
  readonly scenarioId: string;
  readonly executionId: string;
  readonly status: ExecutionStatus;
  readonly disposed: boolean;
  readonly descriptor: ScenarioDescriptor;
  readonly fixtureKeys: readonly string[];
  /** Additive protocol-v1 fields; absent in 0.2.1 and earlier. */
  readonly factories?: readonly FactoryRecord[];
  readonly sourceRevision?: string;
  readonly checkpoints: readonly CheckpointRecord[];
  readonly diagnostics: readonly Diagnostic[];
}
export interface Execution<T extends object> extends SetupContext<T> {
  start(): void;
  checkpoint(
    name: string,
    predicate: () => boolean | Promise<boolean>,
    options?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<void>;
  snapshot(): ExecutionSnapshot;
  dispose(): Promise<void>;
}

function validKey(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value))
    throw new Error(`Invalid identifier: ${value}`);
}
function jsonSafe(value: unknown, seen = new Set<unknown>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || seen.has(value))
    throw new Error("Metadata must contain finite JSON values");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error("Metadata must contain plain JSON objects");
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new Error("Metadata cannot contain symbol keys");
  seen.add(value);
  for (const child of Object.values(value)) jsonSafe(child, seen);
  seen.delete(value);
}
function freezeMetadata<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeMetadata(child);
    Object.freeze(value);
  }
  return value;
}
export class ScenarioPreparationError extends Error {
  constructor(
    message: string,
    readonly snapshot: ExecutionSnapshot,
    cause: unknown,
  ) {
    super(message, { cause });
    this.name = "ScenarioPreparationError";
  }
}
function cloneFixtures<T>(value: T): T {
  function validateValue(candidate: unknown, seen: Set<object>): void {
    if (
      candidate === null ||
      candidate === undefined ||
      typeof candidate === "string" ||
      typeof candidate === "boolean" ||
      typeof candidate === "number"
    )
      return;
    if (typeof candidate !== "object")
      throw new Error("Fixtures must contain plain data, arrays, or valid Dates");
    if (seen.has(candidate)) return;
    seen.add(candidate);
    if (candidate instanceof Date) {
      if (!Number.isFinite(candidate.getTime()) || Reflect.ownKeys(candidate).length > 0)
        throw new Error("Fixture Dates must be valid and have no custom properties");
      return;
    }
    if (
      !Array.isArray(candidate) &&
      Object.getPrototypeOf(candidate) !== Object.prototype &&
      Object.getPrototypeOf(candidate) !== null
    )
      throw new Error("Custom fixture class instances are unsupported");
    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key === "symbol") throw new Error("Fixture symbol keys are unsupported");
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor) continue;
      if (!Object.hasOwn(descriptor, "value")) throw new Error("Fixture accessors are unsupported");
      if (!descriptor.enumerable && !(Array.isArray(candidate) && key === "length"))
        throw new Error("Non-enumerable fixture properties are unsupported");
      const child: unknown = descriptor.value;
      validateValue(child, seen);
    }
  }
  validateValue(value, new Set());
  return structuredClone(value);
}
function validate(definition: ScenarioMetadata): void {
  validKey(definition.id);
  if (!definition.seed) throw new Error("Seed must not be empty");
  const date = new Date(definition.now);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(definition.now) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString() !== definition.now
  )
    throw new Error("now must be a canonical ISO UTC instant");
  if (definition.revision !== undefined) validKey(definition.revision);
  const checkpoints = definition.checkpoints ?? [];
  for (const name of checkpoints) validKey(name);
  if (new Set(checkpoints).size !== checkpoints.length)
    throw new Error("Declared checkpoints must be unique");
  jsonSafe(definition.environment ?? {});
}
function hash(parts: readonly string[]): number {
  let result = 2166136261;
  for (const byte of new TextEncoder().encode(JSON.stringify(parts))) {
    result ^= byte;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
export function defineFactory<T extends object>(factory: Factory<T>): Factory<T> {
  validKey(factory.version);
  return Object.freeze({ ...factory });
}
export function defineScenario<T extends object>(
  definition: ScenarioDefinition<T>,
): ScenarioDefinition<T> {
  validate(definition);
  return Object.freeze({
    ...definition,
    ...(definition.checkpoints ? { checkpoints: Object.freeze([...definition.checkpoints]) } : {}),
    ...(definition.environment
      ? { environment: freezeMetadata(structuredClone(definition.environment)) }
      : {}),
  });
}
export function describeScenario<T extends object>(
  definition: ScenarioDefinition<T>,
): ScenarioDescriptor {
  validate(definition);
  return {
    protocolVersion: 1,
    scenarioId: definition.id,
    description: definition.description ?? "",
    seed: definition.seed,
    now: definition.now,
    seedAlgorithm: "fnv1a-utf8-v1",
    fakerVersion: "10.6.0",
    locale: "en",
    ...(definition.revision !== undefined ? { revision: definition.revision } : {}),
    ...(definition.checkpoints ? { checkpoints: [...definition.checkpoints] } : {}),
    environment: structuredClone(definition.environment ?? {}),
  };
}
function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error("Timeouts and intervals must be positive finite numbers");
  return value;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function bounded<T>(
  work: () => T | Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => finish(() => reject(new Error("Execution aborted")));
    const timer = setTimeout(
      () => finish(() => reject(new Error(`Timed out after ${timeoutMs}ms`))),
      timeoutMs,
    );
    function finish(callback: () => void): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    }
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal?.aborted) throw new Error("Execution aborted");
        return work();
      })
      .then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
  });
}
export interface PrepareScenarioOptions {
  readonly signal?: AbortSignal;
  /** Consumer-supplied build identity, never inferred from a scenario seed. */
  readonly sourceRevision?: string;
}
export async function prepareScenario<T extends object>(
  definition: ScenarioDefinition<T>,
  options: PrepareScenarioOptions = {},
): Promise<Execution<T>> {
  if (options.signal?.aborted) throw new Error("Scenario preparation aborted");
  if (
    options.sourceRevision !== undefined &&
    (options.sourceRevision.trim() !== options.sourceRevision ||
      !options.sourceRevision ||
      options.sourceRevision.length > 200)
  )
    throw new Error(
      "sourceRevision must be a nonempty, trimmed identifier of at most 200 characters",
    );
  const source =
    options.sourceRevision !== undefined ? { sourceRevision: options.sourceRevision } : {};
  const descriptor = describeScenario(definition);
  const keys = new Set<string>();
  const factories: FactoryRecord[] = [];
  const executionId = crypto.randomUUID();
  const fixtures = await (async () => {
    try {
      const { en, Faker } = await bounded(
        async () => {
          const { en, Faker } = await import("@faker-js/faker");
          return { en, Faker };
        },
        options.signal,
        5000,
      );
      if (options.signal?.aborted) throw new Error("Scenario preparation aborted");
      return cloneFixtures(
        definition.fixtures({
          factory(key, factory, overrides) {
            validKey(key);
            if (keys.has(key)) throw new Error(`Duplicate fixture key: ${key}`);
            validKey(factory.version);
            keys.add(key);
            factories.push({ key, version: factory.version });
            const faker = new Faker({ locale: [en] });
            faker.seed(hash(["v1", definition.seed, factory.version, key]));
            faker.setDefaultRefDate(definition.now);
            return cloneFixtures(
              Object.assign(
                cloneFixtures(
                  factory.build({
                    faker,
                    now: new Date(definition.now),
                    id: (name) =>
                      `${key}-${hash(["id-v1", definition.seed, factory.version, key, name]).toString(16)}`,
                  }),
                ),
                overrides,
              ),
            );
          },
        }),
      );
    } catch (error) {
      throw new ScenarioPreparationError(
        message(error),
        {
          protocolVersion: 1,
          scenarioId: definition.id,
          executionId,
          status: "failed",
          disposed: true,
          descriptor,
          fixtureKeys: [...keys],
          factories: [...factories],
          ...source,
          checkpoints: [],
          diagnostics: [{ code: "fixtures", message: message(error) }],
        },
        error,
      );
    }
  })();
  const controller = new AbortController();
  let status: ExecutionStatus = "preparing";
  let disposed = false;
  let failed = false;
  const diagnostics: Diagnostic[] = [];
  const checkpoints = new Map<string, CheckpointRecord>();
  const disposers: (() => void | Promise<void>)[] = [];
  let disposal: Promise<void> | undefined;
  function recordFailure(code: string, detail: string): void {
    failed = true;
    status = "failed";
    if (diagnostics.length < 100) diagnostics.push({ code, message: detail });
  }
  const execution: Execution<T> = {
    fixtures,
    signal: controller.signal,
    fail(code, detail) {
      if (!disposed) recordFailure(code, detail);
    },
    onDispose(callback) {
      if (disposed) throw new Error("Execution is disposed");
      disposers.push(callback);
    },
    start() {
      if (disposed || failed) throw new Error("Execution cannot start");
      status = "running";
    },
    async checkpoint(name, predicate, options = {}) {
      validKey(name);
      if (disposed || failed) throw new Error("Execution cannot checkpoint");
      if ([...checkpoints.values()].some((record) => record.status === "running"))
        throw new Error("Concurrent checkpoints are unsupported");
      if (checkpoints.has(name)) throw new Error(`Duplicate checkpoint: ${name}`);
      const timeoutMs = positive(options.timeoutMs ?? 5000);
      const intervalMs = positive(options.intervalMs ?? 10);
      checkpoints.set(name, { name, status: "running", timeoutMs });
      status = "running";
      let stopped = false;
      try {
        await bounded(
          async () => {
            while (!stopped && !controller.signal.aborted) {
              if (failed) throw new Error("Execution verification failed");
              if (await predicate()) return;
              await bounded(
                () => new Promise<void>((resolve) => setTimeout(resolve, intervalMs)),
                controller.signal,
                timeoutMs,
              );
            }
            throw new Error("Execution aborted");
          },
          controller.signal,
          timeoutMs,
        );
        if (disposed || failed) throw new Error("Execution is no longer active");
        checkpoints.set(name, { name, status: "ready", timeoutMs });
        status = "ready";
      } catch (error) {
        checkpoints.set(name, { name, status: "failed", timeoutMs });
        if (!disposed) execution.fail("checkpoint", `${name}: ${message(error)}`);
        throw error;
      } finally {
        stopped = true;
      }
    },
    snapshot() {
      return structuredClone({
        protocolVersion: 1,
        scenarioId: definition.id,
        executionId,
        status,
        disposed,
        descriptor,
        fixtureKeys: [...keys],
        factories: [...factories],
        ...source,
        checkpoints: [...checkpoints.values()],
        diagnostics,
      });
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      if (!failed) status = "disposed";
      disposal = Promise.resolve().then(async () => {
        for (const cleanup of [...disposers].reverse()) {
          try {
            await bounded(cleanup, undefined, 1000);
          } catch (error) {
            recordFailure("cleanup", message(error));
          }
        }
      });
      controller.abort();
      return disposal;
    },
  };
  if (options.signal) {
    const signal = options.signal;
    const abort = () => {
      void execution.dispose();
    };
    execution.onDispose(() => signal.removeEventListener("abort", abort));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  }
  try {
    await bounded(() => definition.setup?.(execution), controller.signal, 5000);
    if (disposed) throw new Error("Scenario preparation aborted");
    status = failed ? "failed" : "prepared";
    return execution;
  } catch (error) {
    execution.fail("setup", message(error));
    await execution.dispose();
    throw new ScenarioPreparationError(message(error), execution.snapshot(), error);
  }
}

/** Fresh fixture data without mounted resources, globals, or a readiness lifecycle. */
export async function loadScenarioFixtures<T extends object>(
  definition: ScenarioDefinition<T>,
): Promise<T> {
  if (definition.setup !== undefined)
    throw new Error("Fixture-only loading cannot run setup; use prepareScenario or withScenario");
  const execution = await prepareScenario(definition);
  try {
    return execution.fixtures;
  } finally {
    await execution.dispose();
  }
}
