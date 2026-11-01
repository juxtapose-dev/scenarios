import { HttpResponse, http } from "msw/http";
import { setupServer } from "msw/node";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionObserver } from "../src/index.js";
import { createMswSession, createResponseGate, onUnhandledFrame } from "../src/msw.js";

function observer() {
  const controller = new AbortController();
  const failures: string[] = [];
  const cleanups: Array<() => void | Promise<void>> = [];
  const execution: ExecutionObserver = {
    signal: controller.signal,
    fail(code, message) {
      failures.push(`${code}: ${message}`);
    },
    onDispose(cleanup) {
      cleanups.push(cleanup);
    },
  };
  return {
    execution,
    failures,
    async dispose() {
      controller.abort();
      for (const cleanup of cleanups.reverse()) await cleanup();
    },
  };
}

const baseline = http.get("http://example.test/api/items", () =>
  HttpResponse.json({ source: "baseline" }),
);
const server = setupServer(baseline);
let listening = false;
afterEach(() => {
  if (listening) server.close();
  listening = false;
  server.resetHandlers();
});

describe("MSW sessions", () => {
  it("serves stable responses, rejects overlap and restores the declared baseline", async () => {
    const session = createMswSession(server, {
      baselineHandlers: [baseline],
      apiPrefixes: ["/api"],
    });
    listening = true;
    server.listen({ onUnhandledFrame: onUnhandledFrame(session) });
    const other = createMswSession(server, { baselineHandlers: [baseline], apiPrefixes: ["/api"] });
    const run = observer();
    const release = session.attach(run.execution, [
      http.get("http://example.test/api/items", () => HttpResponse.json({ source: "scenario" })),
    ]);
    expect(() => other.attach(observer().execution, [])).toThrow(/active/);
    expect(await (await fetch("http://example.test/api/items")).json()).toEqual({
      source: "scenario",
    });
    expect(await (await fetch("http://example.test/api/items")).json()).toEqual({
      source: "scenario",
    });
    await run.dispose();
    await release();
    expect(await (await fetch("http://example.test/api/items")).json()).toEqual({
      source: "baseline",
    });
  });

  it("blocks and redacts unexpected scoped requests but permits expected errors", async () => {
    const session = createMswSession(server, {
      baselineHandlers: [baseline],
      apiPrefixes: ["/api"],
    });
    listening = true;
    server.listen({ onUnhandledFrame: onUnhandledFrame(session) });
    const run = observer();
    session.attach(run.execution, [
      http.get("http://example.test/api/error", () => new HttpResponse(null, { status: 503 })),
    ]);
    expect((await fetch("http://example.test/api/error")).status).toBe(503);
    expect(run.failures).toHaveLength(0);
    expect((await fetch("http://example.test/api/secret-id?token=private")).status).toBe(500);
    expect(run.failures).toEqual([
      "unhandled-api-request: Unhandled GET request in API scope /api",
    ]);
    expect(session.journal()).toEqual([
      {
        method: "GET",
        path: "/api",
        outcome: "unhandled",
        leaseId: expect.stringMatching(/^msw-/),
      },
    ]);
    await run.dispose();
  });

  it("holds actual responses and ignores paths outside the API scope", async () => {
    const session = createMswSession(server, {
      baselineHandlers: [baseline],
      apiPrefixes: ["/api"],
    });
    listening = true;
    server.listen({ onUnhandledFrame: onUnhandledFrame(session) });
    const run = observer();
    const gate = createResponseGate(run.execution.signal);
    session.attach(run.execution, [
      http.get("http://example.test/api/held", async () => {
        await gate.wait();
        return HttpResponse.json({ ready: true });
      }),
    ]);
    expect(() =>
      session.onUnhandledRequest(new Request("http://example.test/assets/logo.png")),
    ).not.toThrow();
    const response = fetch("http://example.test/api/held");
    gate.open();
    expect(await (await response).json()).toEqual({ ready: true });
    expect(session.journal()).toEqual([]);
    await run.dispose();
  });

  it("routes a delegated startup callback to the current session, and leaves released observers untouched", async () => {
    const startup = createMswSession(server, {
      baselineHandlers: [baseline],
      apiPrefixes: ["/api"],
    });
    const second = createMswSession(server, {
      baselineHandlers: [baseline],
      apiPrefixes: ["/api"],
    });
    listening = true;
    server.listen({ onUnhandledFrame: onUnhandledFrame(startup) });
    const old = observer();
    startup.attach(old.execution, []);
    await old.dispose();
    expect((await fetch("http://example.test/api/late")).status).toBe(500);
    expect(old.failures).toEqual([]);
    const current = observer();
    second.attach(current.execution, []);
    expect((await fetch("http://example.test/api/missing")).status).toBe(500);
    expect(current.failures).toHaveLength(1);
    expect(old.failures).toEqual([]);
    expect(second.journal()).toHaveLength(1);
    await current.dispose();
  });

  it("bounds the journal and validates baseline and API scopes", () => {
    expect(() => createMswSession(server, { baselineHandlers: [], apiPrefixes: ["/api"] })).toThrow(
      /baseline/,
    );
    for (const prefix of ["", "api", "/api?secret", "/api//x", "/api/../x"]) {
      expect(() =>
        createMswSession(server, { baselineHandlers: [baseline], apiPrefixes: [prefix] }),
      ).toThrow();
    }
    const session = createMswSession(server, {
      baselineHandlers: [baseline],
      apiPrefixes: ["/api"],
    });
    for (let i = 0; i < 110; i++) {
      expect(() =>
        session.onUnhandledRequest(new Request(`http://example.test/api/${i}`)),
      ).toThrow();
    }
    expect(session.journal()).toHaveLength(100);
    expect(session.journal().every((entry) => entry.path === "/api")).toBe(true);
  });

  it("latches unexpected handler exceptions even when the application catches them", async () => {
    const session = createMswSession(server, {
      baselineHandlers: [baseline],
      apiPrefixes: ["/api"],
    });
    listening = true;
    server.listen({ onUnhandledFrame: onUnhandledFrame(session) });
    const run = observer();
    session.attach(run.execution, [
      http.get("http://example.test/api/broken", () => {
        throw new Error("private internal error");
      }),
    ]);
    await fetch("http://example.test/api/broken").catch(() => undefined);
    expect(run.failures).toEqual([
      "msw-handler-exception: MSW handler failed for GET request in API scope /api",
    ]);
    await run.dispose();
  });

  it("releases and aborts gates", async () => {
    const controller = new AbortController();
    const gate = createResponseGate(controller.signal);
    const first = gate.wait();
    const second = gate.wait();
    gate.open();
    await expect(Promise.all([first, second, gate.wait()])).resolves.toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    const abortController = new AbortController();
    const aborted = createResponseGate(abortController.signal).wait();
    abortController.abort(new Error("disposed"));
    await expect(aborted).rejects.toThrow("disposed");
  });
});
