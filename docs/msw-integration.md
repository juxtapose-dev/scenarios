# MSW integration

The integration borrows a caller-owned MSW host for one execution at a time.
It does not create or stop workers, own application fetch cancellation, or infer
which mounted component originated an arbitrary request.

## Recommended browser startup

Create the worker and declare its original baseline handlers yourself. Start it
once during preview startup and retain the returned session for subsequent
executions:

```ts
import { setupWorker } from "msw/browser";
import { http, HttpResponse } from "msw/http";
import { startMswWorker } from "@juxtapose/scenarios/msw";

const baselineHandlers = [http.get("/api/health", () => HttpResponse.json({ healthy: true }))];
const worker = setupWorker(...baselineHandlers);
const session = await startMswWorker(
  worker,
  { baselineHandlers, apiPrefixes: ["/api"] },
  { quiet: true },
);
```

`startMswWorker` creates a session, awaits `worker.start`, and wires the session's
`onUnhandledFrame` callback. It forwards other startup options. Startup errors
reject with the original error; the caller owns any worker-specific recovery.
The helper acquires no execution lease until `session.attach` is called.

Use an unstarted worker. The caller must call this startup helper once per worker;
it does not cache startups or detect whether another integration already started
the host with different options. Stop the worker yourself when the preview shuts
down. Browser worker startup and application boot must finish before a story
starts requests.

Attach scenario handlers during mounted setup:

```ts
import { withScenario } from "@juxtapose/scenarios/storybook";

const story = withScenario(scenario, {
  setup(execution) {
    session.attach(execution, [
      http.get("/api/customer", () => HttpResponse.json(execution.fixtures.customer)),
    ]);
  },
});
```

Disposing the execution removes the session's exception listener and restores the
exact baseline. Reuse this session for the next execution. Release the current
execution before attaching another; do not combine runtime handler ownership with
an addon or another session that also calls `use` or `resetHandlers` on this host.
A baseline mismatch means the declared original handlers differ in identity or
order from the current host handlers. Pass the original handler array and resolve
other runtime owners before attaching.

## Manual startup and Node hosts

`createMswSession` remains available for existing host startup code and Node
servers. Wire its callback explicitly when starting the host:

```ts
import { createMswSession, onUnhandledFrame } from "@juxtapose/scenarios/msw";

const session = createMswSession(host, { baselineHandlers, apiPrefixes: ["/api"] });
host.listen({ onUnhandledFrame: onUnhandledFrame(session) });
```

For a manually started browser worker, use `worker.start` with the same callback.
Creating a session alone does not wire unhandled frames. The library cannot
automatically detect a forgotten callback on arbitrary manually started hosts.
The recommended browser helper makes that wiring part of startup.

## Expected errors and unexpected failures

A handler that deliberately returns an HTTP error response, such as status 503,
is an expected scenario response. A handler returning `HttpResponse.error()`
deliberately simulates a transport error: the application fetch rejects, while
the scenario is not failed solely for that response. Neither case is an
unhandled API request.

An unexpected request inside a configured API prefix fails the attached
execution and is blocked. Prefixes match path segment boundaries, across origins.
The bounded journal and diagnostics expose the configured prefix and method,
not the full request URL, query string, private path segments, or thrown handler
message. An observed `unhandledException` from a scoped handler also fails the
execution, even if the application catches its fetch error.

MSW does not observe every possible real transport failure. Browser networking,
requests outside its interception scope, and application-level errors may require
application assertions or explicit checkpoints. Returning a declared error is
not a claim that all rejected fetches are automatically classified.

## Cancellation and held responses

Abort old application requests before replacing their execution. MSW's
unhandled-frame and exception events do not identify which execution originated
an old request; an event arriving after a new lease attaches can otherwise be
attributed to the current lease. Isolation across multiple simultaneous worker
instances or mounted executions is not promised by this baseline integration.

`createResponseGate(execution.signal)` holds a handler until opened and rejects
its waits when the execution aborts. Treat that expected cancellation explicitly
inside an asynchronous handler rather than throwing it as a handler exception:

```ts
const gate = createResponseGate(execution.signal);
const held = http.get("/api/invoices", async () => {
  try {
    await gate.wait();
  } catch (error) {
    if (execution.signal.aborted) return HttpResponse.error();
    throw error;
  }
  return HttpResponse.json(execution.fixtures.invoices);
});
```

This prevents a deliberately aborted gate from becoming a late handler exception.
It does not attribute arbitrary old requests to their originating execution or
replace cancellation of the application's own fetches.
