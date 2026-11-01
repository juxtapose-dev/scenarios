# Juxtapose Scenarios

Reproducible UI scenarios for Storybook development and testing.

`@juxtapose/scenarios` combines named fixtures, isolated Faker generators,
scoped MSW mocking, and bounded readiness checkpoints. Components keep using their real API clients. Every
execution gets fresh data and cleanup, and exposes a small inspection record.

Juxtapose Scenarios does not depend on Juxtapose’s visual testing packages. It
does not capture screenshots, compare pixels, approve changes, or require an account.

## Try the example

Use Node 22.19+ and pnpm 10.33.0:

```sh
pnpm install --frozen-lockfile
pnpm prepare:example
pnpm storybook
```

The billing workbench uses a real Orval-generated client and MSW 3. Stories cover
success, empty data, an expected HTTP error, a held loading response, payment,
and an intentionally unexpected API request. The last story is supposed to fail.

Install the package in your Storybook project:

```sh
pnpm add -D @juxtapose/scenarios@0.2.1
```

The package is ESM and requires Node 22.19 or later. Storybook and MSW are
optional peers; install them when using the corresponding integration.
Its public entry points are:

```ts
import { defineFactory, defineScenario } from "@juxtapose/scenarios";
import { withScenario } from "@juxtapose/scenarios/storybook";
import { startMswWorker } from "@juxtapose/scenarios/msw";
// Next release after 0.2.1:
import { inspectScenario } from "@juxtapose/scenarios/inspection";
```

## Define repeatable data

Factories receive their own Faker instance. A named fixture's random stream is
independent of the order in which unrelated fixtures are built.

```ts
import { defineFactory, defineScenario } from "@juxtapose/scenarios";

const customerFactory = defineFactory({
  version: "1",
  build: ({ faker, id }) => ({
    id: id("customer"),
    name: "Alex Morgan",
    email: faker.internet.email(),
  }),
});

export const overdueAccount = defineScenario({
  id: "billing/overdue",
  seed: "billing-demo-v1",
  now: "2026-10-01T12:00:00.000Z",
  fixtures: ({ factory }) => ({
    customer: factory("customer:primary", customerFactory),
  }),
});
```

Write important names, amounts, boundary cases, and relationships explicitly.
Use Faker for incidental content. An override is shallow and typed; duplicate
fixture keys fail. The fixture result is structured-cloned to prevent accidental
sharing between executions. Fixtures support plain data, arrays, and valid Dates. Custom classes, functions,
accessors, and symbol properties are rejected; keep service handles in setup instead.

Reproducibility depends on the seed, named key, factory version/implementation,
Faker version, locale, and reference date. This release pins Faker 10.6.0 and uses
the English locale. Adding a random draw inside a factory can change its later
fields. Updating Faker may change output for the same seed. Commit explicit data
for examples that must remain stable across generator upgrades.

`now` is a canonical ISO UTC instant, including milliseconds. It controls Faker
date generation and the factory clock; it does not patch the application's Date,
timers, Math.random, crypto, browser locale, or timezone. Inject those application
dependencies explicitly. Deterministic IDs are fixture conveniences, not globally
unique or cryptographically secure identifiers.

See [reproduction and environment contracts](docs/reproducibility.md) for executed
factory versions, source/scenario revisions, injected clocks, and browser settings.
Core defers loading Faker until preparation; declaration/catalog inspection does
not initialize generators.

## Fixture-only stories

For data-only stories, `loadScenarioFixtures(scenario)` returns fresh inferred
fixture data without mounted setup resources. In Storybook, `withFixtures(scenario)`
provides standard loader annotations and `read(context)` for typed access during
render. This path supports concurrent inline Docs and works with ordinary React
and Svelte stories. Definitions with setup callbacks are rejected; use
`withScenario` for mounted setup, checkpoints, and MSW ownership.

See [fixture-only loading](docs/fixture-loading.md) for Controls, loader composition,
and framework examples. These APIs are available from 0.2.0.

## Connect Storybook and MSW

Install MSW 3 and initialize its worker in your Storybook static directory:

```sh
pnpm add -D msw@^3.0.3
pnpm exec msw init public --no-save
```

Create one worker and one session in a project module:

```ts
import { setupWorker } from "msw/browser";
import { startMswWorker } from "@juxtapose/scenarios/msw";

export const worker = setupWorker();
export const sessionReady = startMswWorker(
  worker,
  { baselineHandlers: [], apiPrefixes: ["/api"] },
  { quiet: true },
);
```

The helper awaits startup and wires the required MSW 3 unhandled-frame callback.
For an existing worker or a Node host, manual `createMswSession` wiring remains
available. See [MSW integration](docs/msw-integration.md) for ownership, startup
options, transport failures and migration from another handler manager.

Wrap a normal CSF story:

```tsx
import { http, HttpResponse } from "msw/http";
import { withScenario } from "@juxtapose/scenarios/storybook";
import { Account } from "./Account";
import { overdueAccount } from "./scenarios";
import { sessionReady } from "./network";

const account = withScenario(overdueAccount, {
  async setup(execution) {
    const session = await sessionReady;
    session.attach(execution, [
      http.get("/api/customer", () => HttpResponse.json(execution.fixtures.customer)),
    ]);
  },
  async play({ canvasElement }, execution) {
    await execution.checkpoint(
      "account-loaded",
      () => canvasElement.querySelector("h1")?.textContent === "Alex Morgan",
    );
  },
});

export default { component: Account };
export const Overdue = { ...account.annotations };
```

Juxtapose Scenarios owns the story's `beforeEach` and `play` annotations. Put custom setup
and play in the callbacks above; overwriting the generated hooks bypasses the
contract. Other ordinary story options remain available. For provider wiring,
`account.current()` supplies the typed execution after preparation.

The MSW session requires exclusive handler ownership. Its declared baseline must
match the worker's initial handlers in identity and order. It restores that
baseline on disposal and rejects overlapping leases. Do not simultaneously let
`msw-storybook-addon` or another integration reset the same worker's handlers.
Existing workers are supported when their owner grants this contract and delegates
the startup callback. Worker startup and shutdown remain the application's job.

API prefixes match pathname segment boundaries on every origin: `/api` matches
`/api/invoices` but not `/apiculture`. Unhandled scoped requests are blocked and
latch a failure. Expected mocked HTTP 4xx/5xx responses do not fail verification
by themselves. Exceptions thrown by matched handlers also latch failures. MSW 3
does not reliably expose intentional `HttpResponse.error()` transport failures
through these events; explicitly call `execution.fail` for unexpected application
transport errors. Asset traffic outside configured scopes is allowed.

## Setup and cleanup

`scenario.setup` is reusable setup; the `setup` option passed to `withScenario`
is Storybook-specific.
Register resources immediately with `execution.onDispose`. Cleanup aborts the
execution signal first, then runs every callback once, in reverse registration
order. Each callback has a one-second bound; failures remain in diagnostics.

Use the signal for your own asynchronous work. React effects should also abort
their requests on unmount. A timeout can stop waiting for a promise but cannot
stop arbitrary code that ignores its signal. Late application requests cannot be
reliably attributed to a previous scenario by MSW after a new lease begins.

Checkpoints poll a boolean/async predicate, defaulting to five seconds and a ten
millisecond interval. Thrown predicates fail immediately. Names cannot be reused
within one execution. `setupTimeoutMs` and `playTimeoutMs` configure the adapter's
five-second callback bounds; `checkpoint` accepts its own bounds.

The adapter adds `play-complete` after successful play. Readiness means the named
condition was reached. It does not prove paint, fonts, assets, or animations are
settled. Capture tools retain responsibility for those barriers.

Use `createResponseGate(execution.signal)` to hold a loading response, and call
`gate.open()` to release it. `gate.wait()` rejects on disposal. Avoid random
latency or sleeps as a readiness mechanism. See [the network example](example/network.ts).

## Orval

Keep generated API types/clients and project-owned domain fixtures separate.
Use generated models as factory result types. MSW intercepts the real client's
requests; Juxtapose Scenarios does not replace generated hooks or generate another client.

The checked-in synthetic OpenAPI contract and generated client can be regenerated:

```sh
pnpm generate
pnpm check:generated
```

The example pins Orval 8.46.0. Its generator uses union enums and rejects non-2xx
responses, avoiding type assertions even in generated code. Generated types do not
constitute runtime response validation. In particular, do not trust a generated
error's typed `info` payload without validating it.

Generated Faker factories that import a shared singleton are not automatically
isolated. Prefer Juxtapose Scenarios factories returning Orval model types, or materialize
static fixtures separately. Never globally reseed Faker around concurrent requests.

See the [Orval/MSW adoption guide](docs/orval-msw.md) for a complete typed-factory
and runtime-validation workflow, including deliberate invalid payload scenarios.

## Inspection for agents and capture tools

`describeScenario` returns declaration metadata without running fixtures. In a
Storybook preview, `window.__JUXTAPOSE_SCENARIOS__.getActive()` returns a versioned snapshot
containing story/scenario/execution identity, status, checkpoint results,
deterministic inputs, fixture keys, and diagnostics. Fixture payloads
are excluded. Snapshot values are detached from runtime state.

Read the execution ID, wait for the required checkpoint, and read that same ID
again before accepting a capture. Reject failures, disposed runs, or an execution
change. A late API failure invalidates earlier readiness. The bridge retains a
failed execution after cleanup so a consumer can diagnose it; always check story
identity and `disposed`. See [the consumer protocol](docs/consumer-protocol.md).

The bounded MSW journal contains only unhandled requests, with redacted scope
paths and lease IDs. It is not a full network trace. Metadata, seeds, descriptions,
and custom diagnostic messages are authored by your project: keep secrets out.

The next release adds a lightweight `./inspection` entry point for explicit
catalogs, Storybook public-index resolution, readiness explanations and evidence
metadata tied to a build revision. See [the agent workflow](docs/agent-workflow.md).
These helpers assess readiness; capture and approval remain external.

## Verified scope

The conformance workbench targets Storybook 10.6.5, React 19.3.1, Svelte 5.55.7,
MSW 3.0.3, and Chromium. Tests cover StrictMode mounting, warm sidebar navigation, held-response
cleanup, repeated data, independent pages, and failure handling.

The `withScenario` lifecycle adapter supports isolated story canvases; concurrent
Docs canvases are rejected. The fixture core is renderer-independent. Fixture-only
consumers can prepare fresh data in a Storybook loader and dispose the execution
before returning it, without using the adapter or acquiring an MSW lease. This
allows independent fixture data for concurrent Docs stories.
Mounted args-only updates preserve the execution, fixture mutations and readiness.
Storybook Reload story / Interactions Rerun remounts with fresh data and a new
execution ID. Reset Controls changes args only. See [the lifecycle contract](docs/lifecycle.md).
HMR, other React versions/frameworks,
SSR/server-component requests, and cross-browser pixels are not guaranteed.
Reload the preview when changing setup code. No claim of pixel determinism is
made from these DOM and network tests.

See [measured costs and adoption ergonomics](docs/costs.md) for bundle/import
measurements and the rationale for keeping the current helper APIs.

## Development

```sh
pnpm check            # Biome plus AST enforcement of no casts/any/suppressions
pnpm typecheck       # Strict TypeScript
pnpm test            # Core, MSW, lifecycle, generated client, negative type tests
pnpm build           # ESM and declarations
pnpm prepare:example
pnpm build:storybook
pnpm exec playwright install chromium
pnpm test:browser
pnpm check:package   # Pack allowlist and isolated import smoke check
```

`pnpm verify` runs the full local quality gate. CI runs the same checks and
repeated browser conformance without retries. There is no automatic publishing
workflow. Read [the implementation plan](docs/implementation-plan.md) for scope,
review decisions, and deferred work.

MIT licensed.
