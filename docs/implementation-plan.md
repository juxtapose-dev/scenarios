# Juxtapose Scenarios implementation plan

Status: reviewed, implemented, and locally verified for the initial release.

Build `@juxtapose/scenarios` as an independent TypeScript library in the
`juxtapose-dev/scenarios` repository. Target Storybook only. Juxtapose Scenarios defines
repeatable UI conditions; the visual testing tool remains a separate consumer.
The initial release must demonstrate the complete loop in a real Storybook,
including actual HTTP requests and an Orval-generated client.

## Product boundaries

- No dependency on Juxtapose packages or private application code.
- No Ladle support, generalized host plugin framework, backend simulator,
  visual comparison engine, or approval UI.
- Feature flags and experiments are outside the current scope.
- Use MSW for interception and Faker for synthetic data. Reuse Orval types and
  generated clients; do not generate another API client.
- Storybook React is the initial verified framework. Do not advertise Vue,
  Angular, server components, SSR interception, or arbitrary versions as tested.
- One library package, a small example workbench, and focused tests. Avoid a
  monorepo package graph until separate versioning is necessary.
- Keep implementation and commits suitable for public release. No credentials,
  internal research, private fixtures, local paths, browser artifacts, or logs.

## Engineering rules

- Strict TypeScript, unchecked indexed access, exact optional property types.
- No `any`, type assertions, non-null assertions, or suppression directives.
  Use inference, discriminated unions, type predicates, and explicit adapters.
- Biome for lint/format, TypeScript for type checking, Vitest for contract tests,
  Playwright for a real static Storybook integration test.
- Pin development tool versions and Faker; commit the lockfile. Narrow published
  peer ranges to versions actually supported by the implementation.
- ESM, declaration files, explicit package exports, published-file allowlist.
- Ordinary installation and use must not require credentials or remote services.

## Public modules

`@juxtapose/scenarios`: scenario definitions, typed fixtures, executions,
checkpoints, inspection records, and composition.

`@juxtapose/scenarios/storybook`: Storybook lifecycle integration and access to
the active execution from story code. Preserve ordinary stories and play functions.

`@juxtapose/scenarios/msw`: connect prepared handlers to an existing MSW worker
or server; strict unexpected-API policy and request diagnostics. One worker owner.

Orval should need a recipe and a tested generated-client example, not a dependency
on the generator at runtime. Add an Orval-specific module only if a concrete
contract cannot be expressed with ordinary typed factories and MSW handlers.

## Scenario contract

Every definition has a stable explicit ID, description, seed, reference date,
environment metadata, fixtures, and named checkpoints. Declaration alone must perform no I/O or random generation.

Use generics to preserve fixture types from creation through setup and play.
The metadata is JSON-safe; callbacks and handlers remain executable code and are
not serialized or reconstructed from the manifest. Provide runtime validation
for IDs, dates, positive timeouts, duplicate keys, and unsupported metadata.

Preparation creates a fresh execution containing fixtures, abort signal,
diagnostics, disposers, and a non-reusable execution identity. The same scenario
can be prepared repeatedly without sharing mutable state. Definitions are not
registries with hidden global state.

Support explicit scenario extension with child overrides and stable ordering.
Do not deep-merge arbitrary fixtures or handler arrays. Named configuration
overrides must be inspectable; conflicting ownership should fail clearly.

## Deterministic fixtures

Provide a typed `defineFactory` whose callback receives an isolated Faker
instance, fixed reference date, and deterministic ID/random helpers. An execution
constructs fixtures by named key. Derive the random seed from a versioned stable
hash of root seed, factory version, and fixture key. Never use request ordering,
execution ID, Date.now, or a shared Faker singleton in seed derivation.

Same key cannot silently refer to two definitions or overrides. Prefer rejecting
duplicate construction to accidental sequence dependence. Factories may return
domain objects; public manifest snapshots must not expose fixture bodies by default.
Factories run synchronously; asynchronous fixture acquisition is explicit setup.

Important layout content, boundary cases, IDs, and relationships are authored
explicitly. Faker supplies incidental values. A new draw within one factory may
change subsequent fields in that factory; document that limit. Named field streams
can isolate sensitive fields without promising cross-version Faker stability.

Record seed algorithm version, Faker version, locale, and reference date. No
ambient Math.random/crypto monkeypatching. Date observed by the application is
separate from Faker's reference date; application clocks use explicit providers.
Browser locale/timezone cannot be reliably changed by a decorator; report them as
required capture environment and verify externally where possible.

## Lifecycle and readiness

State machine: created -> preparing -> prepared -> running -> ready, with failed
and disposed terminal outcomes. A checkpoint is meaningful only for its execution.
Setup completes before rendering and before requests can escape. Every registered
cleanup runs once in reverse order, including partial setup and failure paths.
Abort cancels outstanding waits; no old execution can mark a new execution ready.

Checkpoint evaluation is bounded, reports its name and timeout, and preserves
errors. Successful DOM readiness does not claim fonts, pixels, or capture have
settled; those remain consumer responsibilities. Do not silently retry errors.
Expose immutable snapshots with status and diagnostics; do not expose mutable
runtime internals as the integration protocol.

Story switches, args changes, remounts, StrictMode, failed play, and HMR must not
reuse fixtures/caches accidentally. Use Storybook public lifecycle hooks and
explicit disposal; confirm cleanup semantics against the installed version.
Avoid relying solely on React effect cleanup for before-render setup.

## MSW integration

Use current supported MSW API verified against installed package types. Keep
worker startup ownership with the application's Storybook integration. Do not
start a second service worker when an existing worker is supplied.

Prepared data is returned on every matching request; no Faker calls in request
handlers. Support normal MSW handlers including errors, mutations, and deferred
responses. A small abortable response gate supports deterministic loading states.
Scenario-local state may implement explicit transitions, never a generic database.

Unexpected requests within configured API scopes fail verification and add a
structured diagnostic. Allow explicitly configured non-API assets and Storybook
development traffic. No broad default pass-through for unmatched API requests.
Request journals store method, redacted path, match outcome, and execution identity;
do not record credentials, headers, query values, or bodies by default. Bound logs.

Require exclusive ownership of runtime handler changes and an explicit list of
baseline handlers. Restore that declared baseline on disposal; never claim to
recover arbitrary unknown runtime overrides. An existing worker is supported only
when its owner delegates its startup unhandled-request callback and grants this
exclusive lease. Do not concurrently use another addon's runtime handler manager.
Concurrent scenarios in one worker are rejected. Browser isolation handles parallel pages.
Network failures must make readiness fail even if application UI renders an error.
Expected error responses are distinct from unexpected request failures.

## Orval integration

Commit a small synthetic OpenAPI contract for customers/invoices and generate a
real client/types with pinned Orval. The example makes actual requests through
that client, intercepted by MSW and served with typed scenario fixtures.
Include success, empty, error, loading, and a mutation/retry state where feasible.
Prove shared references across endpoints and repeat reads return identical data.

Check the installed generator output rather than assuming the latest website's
fixture APIs exist in every release. Never hand-edit generated output. Regeneration
has a check command. Public sample data is synthetic and contains no actual users.

Generated Faker factories importing a singleton are not treated as isolated.
Recommend Juxtapose Scenarios factories typed against generated models, or separately
materialized static fixture JSON. Do not introduce unsafe global reseeding wrappers.

## Inspection and capture integration

Provide a versioned JSON-safe scenario descriptor and execution snapshot with
scenario ID, execution identity, phase, checkpoints, fixture keys, deterministic
environment, and bounded diagnostics. Do not serialize
callback source, fixture payloads, secrets, or absolute source paths.

A Storybook preview bridge exposes only versioned descriptors/snapshots for the
active story, using validated lookup and story identity. External tools can wait
for the matching execution checkpoint and distinguish failure from timeout.
Do not modify Juxtapose in this repository. Document the consumer contract and
prove it in browser tests. Static cross-story discovery is deferred unless it can
be achieved through public Storybook metadata without a custom compiler.

## Tests and acceptance criteria

Core tests: same inputs match; reordered unrelated fixtures do not alter existing
values; repeat execution is fresh; different seeds differ; fixed dates are stable;
invalid IDs/dates fail; factory collisions fail; extension semantics
are explicit; snapshots are JSON-safe and exclude bodies; cleanup runs after failure.

Lifecycle tests: timeout, abort, stale completion, double dispose, reverse cleanup,
cleanup failures, overlapping execution, failed setup, and checkpoint failure.

MSW tests use the actual Node MSW server: repeated GET consistency, error responses,
unhandled API diagnostics, allowed assets, request journal redaction, handler reset,
gates and abort, and isolation from prior scenarios.

Type tests ensure inferred fixture access works and invalid
factory overrides are rejected. Use compiler-driven negative fixture tests without
casts or suppression comments in shipped sources.

Real Storybook tests build and serve the workbench, navigate multiple scenarios,
invoke the generated API client, inspect checkpoints/diagnostics, switch A -> B -> A,
retry, rerender, and verify repeat data/DOM. Include an intentionally failing API
scenario to prove a false green is rejected. At least two independent pages.

Quality gate: lint/format, strict typecheck, unit/integration tests, package build,
Storybook production build, browser conformance, generated-file check, and package
tarball content/import smoke check. No claim of pixel determinism from DOM-only tests.

## Implementation sequence

1. Review this plan independently, incorporate changes, and freeze a small shared
   API contract before parallel implementation.
2. Scaffold package, tooling, CI, publication allowlist, and test commands.
3. Implement deterministic factories, scenarios, and execution lifecycle.
4. Implement MSW ownership/diagnostics/gates and Storybook integration.
5. Add synthetic Orval workbench and browser conformance tests.
6. Integrate, review implementation, run quality gates, fix failures, and document
   exact supported versions, recipes, limitations, and extension points.
7. Audit tracked and packaged files for public suitability. Create private org repo
   and push only audited source if authorized tooling allows; never publish npm
   automatically. No automatic public visibility change.

## Deferred features

Server-side interception, other frameworks/hosts, complete state-space coverage,
automatic code discovery, generated design documentation, persisted reviews,
record/replay of real user sessions, global random/time patching, package publishing,
and general-purpose fixture databases are intentionally outside the initial release.

## Independent review and resulting decisions

Sol and Terra reviewed the draft before implementation. Both identified MSW global
handler ownership as a correctness blocker; the explicit lease above replaces the
unsafe promise to restore arbitrary host state. Strict interception must be wired
at worker startup. Unexpected API requests latch failure for the execution.

Bound every checkpoint and cleanup callback, preserve all cleanup failures, and
abort before teardown. No completed or stale callback may revive a disposed run.
Only claim lifecycle behavior exercised in the actual pinned Storybook. HMR is a
documented limitation until a dev-server test proves it. Full reload is the recovery
for unsupported host lifecycle behavior.

Clone serializable fixture data per execution and expose snapshots without mutable
references. Require finite JSON values in metadata. Same-seed reproducibility is
bounded by Faker version/locale, factory implementation, seed algorithm, and input.
Use a specified UTF-8 hash; do not imply collision-free IDs.

Initial composition is explicit reuse of factories and object spreads with a new
scenario ID, avoiding a second inheritance system.

Authored TypeScript has no casts or suppression directives. Inspect Orval output
and choose a generator configuration that meets this rule where possible; any
third-party generated exception must be narrow, documented, and untouched.

## Shared implementation contract

Core exports `defineFactory`, `defineScenario`, and `prepareScenario`.
`defineFactory<T extends object>({version, build})` receives a fresh Faker,
fixed `now`, and `id(key)` helper. `FixtureContext.factory(key, factory, overrides?)`
returns inferred T and rejects reused keys. Scenario `fixtures(context)` infers T.

Scenario options: `id`, `description?`, `seed` (string), `now` (ISO instant),
`fixtures(context)`, `environment?` (JSON metadata), and
`setup?(context)`. No networking imports in core. Setup context includes fixtures,
signal, `onDispose(callback)`, and `fail(code, message)`.

`prepareScenario(definition)` returns `Promise<Execution<T>>`. Execution exposes
`fixtures`, `signal`, `start()`, `checkpoint(name, predicate, {timeoutMs?, intervalMs?}?)`,
`fail(code, message)`, `onDispose(callback)`, `snapshot()`, and async `dispose()`.
Core exports `ExecutionObserver` with signal/fail/onDispose for integration modules.
Snapshot has `protocolVersion: 1`, `scenarioId`, `executionId`, `status`, checkpoint
records, diagnostics, and a deterministic descriptor; metadata excludes fixture
bodies. `describeScenario` returns the serializable declaration metadata.

MSW exports `createMswSession(host, {baselineHandlers, apiPrefixes})` with methods
`onUnhandledRequest(request)`, `attach(executionObserver, handlers)` returning async
release, and `journal()`; host is the structural public subset of MSW use/resetHandlers.
The startup callback delegates to session.onUnhandledRequest. Unexpected scoped
requests throw and call execution.fail. No API scope defaults that mask failures.
Provide abortable `createResponseGate(signal)` for held responses. Node tests use
actual MSW; root implementation integrates it into browser Storybook.

Storybook exports `withScenario(scenario, {setup?, play?})` returning `annotations`
(beforeEach, play, parameters) and `current()` for typed provider wiring. Setup
receives the prepared execution; play receives a minimal canvas context and that
execution. Both callbacks are wrapped for failure/disposal. No global generic
fixture lookup or cast-heavy registry. Preview bridge supplies read-only snapshots,
never fixtures. Human story code uses the closure's typed current() accessor.

## Reference material

- https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-network-requests
- https://storybook.js.org/docs/writing-tests/interaction-testing
- https://mswjs.io/guides/integrations/storybook
- https://orval.dev/docs/guides/msw/
- https://orval.dev/docs/guides/faker/
- https://orval.dev/docs/guides/fixtures/
- https://fakerjs.dev/guide/usage.html
- https://biomejs.dev/reference/configuration/

## Delivery and verification

The initial implementation includes the core scenario/factory API, bounded
execution/checkpoints, reverse cleanup, scoped MSW
ownership, response gates, Storybook annotations, and the versioned preview bridge.
An independent synthetic workbench uses Orval-generated clients against MSW, with
success, empty, expected error, loading, payment, and unexpected-request stories.

Sol and Terra implemented separate areas and reviewed the contracts and final
implementation. Review fixes include exclusive MSW ownership, stale execution
protection, retained failed preparation snapshots, bounded cleanup, plain-data
fixture validation, matched-handler exception reporting, and mutation cancellation.

Local acceptance results:

- Biome lint/format and strict TypeScript pass.
- AST checks reject casts, explicit any, non-null assertions, and suppression
  directives in authored and Orval-generated TypeScript.
- 37 unit/integration/compiler tests pass, including five compiler-driven type
  tests and actual MSW Node interception.
- The Storybook production build succeeds on the pinned toolchain.
- Five browser conformance cases pass three consecutive repetitions with two
  workers and no retries: 15 passes. Warm navigation verifies execution identity,
  matching story identity, clean diagnostics, and completed checkpoints.
- Orval regeneration produces identical files.
- A packed-package smoke test installs only the tarball and required peers in an
  isolated directory, imports every public entry point, and checks fixture
  repeatability. The tarball contains 11 allowlisted source/declaration/docs files.
- Frozen-lockfile install succeeds. Existing Juxtapose source remains untouched.

Scope refinements from implementation:

- The MSW journal reports bounded, redacted unmatched requests with lease IDs;
  it is not a complete matched-request trace. Handler exceptions are diagnosed.
- MSW 3 does not reliably emit a response/exception event for intentional
  HttpResponse.error transport errors. Unexpected application transport failures
  need explicit execution.fail; intentional HTTP errors remain valid scenarios.
- Factory data is limited to plain records, arrays, primitives, and valid Dates.
  Custom classes, accessors, functions, and symbol properties are rejected before
  cloning. Diagnostic metadata remains strictly finite JSON.
- Initial composition is ordinary factory/helper reuse and explicit scenario
  definitions. There is no scenario inheritance or field-stream framework.
- Core locale is pinned to English. Environment metadata does not enforce browser
  locale/timezone or patch application clocks/randomness.
- Args-only updates, HMR, repeated same-ID play on a replacement execution, render
  errors outside the wrapped hooks, and automatic retry are not verified guarantees.
  Use a fresh preview/remount for reset. Concurrent Docs stories are unsupported.
- Inspection is per active preview, not a compiled cross-story manifest. A capture
  consumer must require the matching named checkpoint and play-complete, check the
  execution identity before and after capture, and apply its own paint barriers.

CI reproduces these checks on Linux; its remote result is separate from local
verification. There is no automatic package publishing or visibility change.
