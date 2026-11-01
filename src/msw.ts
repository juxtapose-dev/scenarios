import type { AnyHandler, SharedOptions } from "msw";
import type { ExecutionObserver } from "./index.js";

/** The host must grant exclusive ownership of runtime handler changes. */
export interface MswHost {
  listHandlers(): readonly AnyHandler[];
  events: {
    on(event: "unhandledException", listener: (event: { request?: Request }) => void): unknown;
    removeListener(
      event: "unhandledException",
      listener: (event: { request?: Request }) => void,
    ): unknown;
  };
  use(...handlers: AnyHandler[]): void;
  resetHandlers(...handlers: AnyHandler[]): void;
}

export interface MswSessionOptions {
  baselineHandlers: readonly AnyHandler[];
  /** Path prefixes, matched on path segment boundaries, for all origins. */
  apiPrefixes: readonly string[];
}

export interface RequestJournalEntry {
  method: string;
  /** Only the configured prefix is exposed; individual path segments may contain IDs. */
  path: string;
  outcome: "unhandled";
  leaseId: string | null;
}

const leases = new WeakMap<MswHost, (request: Request) => void>();
const JOURNAL_LIMIT = 100;
let nextLeaseId = 0;

export function createMswSession(host: MswHost, options: MswSessionOptions) {
  if (leases.has(host)) throw new Error("Cannot create a session while the host is leased");
  const baseline = [...options.baselineHandlers];
  function requireBaseline(): void {
    const existing = host.listHandlers();
    if (
      existing.length !== baseline.length ||
      existing.some((handler, index) => handler !== baseline[index])
    ) {
      throw new Error("Declared baseline must match the host's current handlers in order");
    }
  }
  requireBaseline();
  const prefixes = options.apiPrefixes.map((prefix) => {
    if (
      !/^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/?)?$/.test(prefix) ||
      prefix.split("/").some((part) => part === "." || part === "..")
    ) {
      throw new Error("API prefixes must be absolute paths without query or fragment");
    }
    return prefix === "/" ? prefix : prefix.replace(/\/+$/, "");
  });
  if (prefixes.length === 0) throw new Error("At least one API prefix is required");
  let active: ExecutionObserver | undefined;
  let leaseId: string | null = null;
  const entries: RequestJournalEntry[] = [];

  function scope(request: Request): string | undefined {
    const path = new URL(request.url).pathname;
    return prefixes.find(
      (value) => value === "/" || path === value || path.startsWith(`${value}/`),
    );
  }

  function handleUnhandled(request: Request): void {
    const prefix = scope(request);
    if (prefix === undefined) return;
    entries.push({ method: request.method, path: prefix, outcome: "unhandled", leaseId });
    if (entries.length > JOURNAL_LIMIT) entries.shift();
    active?.fail(
      "unhandled-api-request",
      `Unhandled ${request.method} request in API scope ${prefix}`,
    );
    throw new Error(`Unhandled ${request.method} request in API scope ${prefix}`);
  }

  function attach(
    observer: ExecutionObserver,
    handlers: readonly AnyHandler[],
  ): () => Promise<void> {
    if (leases.has(host))
      throw new Error("MSW host already has an active Juxtapose Scenarios session");
    if (observer.signal.aborted) throw new Error("Cannot attach a disposed execution");
    requireBaseline();
    leases.set(host, handleUnhandled);
    active = observer;
    leaseId = `msw-${++nextLeaseId}`;
    let released = false;
    const onException = (event: { request?: Request }) => {
      if (!(event.request instanceof Request)) return;
      const prefix = scope(event.request);
      if (prefix !== undefined && !observer.signal.aborted) {
        observer.fail(
          "msw-handler-exception",
          `MSW handler failed for ${event.request.method} request in API scope ${prefix}`,
        );
      }
    };
    const release = async () => {
      if (released) return;
      released = true;
      try {
        host.events.removeListener("unhandledException", onException);
        host.resetHandlers(...baseline);
      } finally {
        active = undefined;
        leaseId = null;
        leases.delete(host);
      }
    };
    try {
      host.events.on("unhandledException", onException);
      host.resetHandlers(...baseline);
      host.use(...handlers);
      observer.onDispose(release);
    } catch (error) {
      released = true;
      try {
        host.events.removeListener("unhandledException", onException);
        host.resetHandlers(...baseline);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "MSW setup and restoration failed");
      } finally {
        active = undefined;
        leaseId = null;
        leases.delete(host);
      }
      throw error;
    }
    return release;
  }

  function onUnhandledRequest(request: Request): void {
    const owner = leases.get(host);
    if (owner) owner(request);
    else handleUnhandled(request);
  }
  return { attach, onUnhandledRequest, journal: () => entries.map((entry) => ({ ...entry })) };
}

/** Release a held handler or reject its wait when the execution is aborted. */
export function createResponseGate(signal: AbortSignal) {
  let open = false;
  const waiters = new Set<() => void>();
  return {
    open() {
      open = true;
      for (const release of waiters) release();
      waiters.clear();
    },
    wait(): Promise<void> {
      if (signal.aborted) return Promise.reject(signal.reason);
      if (open) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const release = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          waiters.delete(release);
          reject(signal.reason);
        };
        signal.addEventListener("abort", abort, { once: true });
        waiters.add(release);
      });
    },
  };
}

/** Adapter for the host's MSW 3 `onUnhandledFrame` startup option.
 * Abort old application requests before attaching a new execution: MSW does not
 * identify which execution originated an unhandled frame.
 */
export function onUnhandledFrame(session: {
  onUnhandledRequest(request: Request): void;
}): Extract<NonNullable<SharedOptions["onUnhandledFrame"]>, (...args: never[]) => unknown> {
  return ({ frame }) => {
    const data: unknown = frame.data;
    if (
      frame.protocol === "http" &&
      typeof data === "object" &&
      data !== null &&
      "request" in data &&
      data.request instanceof Request
    ) {
      session.onUnhandledRequest(data.request);
    }
  };
}
