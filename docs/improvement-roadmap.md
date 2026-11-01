# Scenarios improvement roadmap

Status: proposed sequence after 0.1.0; this document does not expand the verified
support claims of the released package. Prioritize the next milestone, then use
its acceptance evidence to refine the following one.

## Progress

- Milestone 0: npm 0.1.0 released; service PR uses the registry dependency.
- Milestone 1: implementation and full verification complete (37 unit tests,
  11 React/Svelte browser tests, strict TypeScript 6/7 installed consumers).
  Released in 0.2.0; the service now uses the public helper without its wrapper.
- Milestone 2: implementation and full verification complete (47 unit tests,
  15 browser tests, strict installed consumers). Storybook render signals bind
  ownership; args preserve state/readiness, Reload/Rerun creates fresh runs.
  Released in 0.2.0.
- Milestone 3: implemented and verified in the library (52 unit tests,
  15 browser tests, strict installed consumers) and the production-consumer
  harness (313 unit tests and 67 browser tests). Includes real-client request
  cancellation and expected/unexpected network outcomes. Released as npm 0.2.0;
  service PR #414 uses the registry package.
- Release follow-up: 0.2.1 published with reentrant disposal protection; service PR
  #414 merged using the registry dependency.
- Next batch: user authorized environment/data contracts, Orval/MSW guidance,
  agent inspection and measured ergonomics/costs. Release ergonomics remains
  deferred until the next release. See `current-batch-plan.md`.
- Current batch implements the baseline of milestones 6–7 and cost measurement
  from 8: factory/source revision metadata, environment and runtime-validation
  examples, explicit catalog/index export, inspection/evidence helpers and deferred
  Faker loading. Verification evidence is recorded with the batch PR. These are
  included in 0.3.0.
- Remaining: conditional instance ownership and expanded Docs; expanded
  compatibility/browser matrix, large-consumer incremental/HMR measurements,
  additional Faker locales. Release automation now has a manually dispatched OIDC
  workflow and verified-tarball handoff; first live publishing validation remains
  pending. No new support claims for
  concurrent lifecycle Docs or untested frameworks/browsers.

## Objective and boundaries

Make a named UI state easy for a developer or agent to create, reproduce, review,
and explain. Treat fresh data, execution identity, cleanup, and visible failures
as the foundation for broader integrations.

Keep core independent of Juxtapose. Stay with Storybook. Feature flags and
experiments remain outside scope. Keep strict TypeScript inference without casts,
explicit any, non-null assertions, or suppression comments. Do not add a generic
plugin framework, custom fixture language, or a second API generator.

Fixture-only loading and a mounted scenario execution are distinct capabilities:
a fixture loader returns data; a mounted execution owns readiness and resources.
Docs support for one does not imply Docs support for the other.

## Priority and dependencies

| Order | Priority       | Work                                                           | Depends on                                          | Completion evidence                                                                       |
| ----- | -------------- | -------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 0     | P0             | Finish registry release and service handoff                    | Release CI and npm approval                         | Clean install from npm; service PR has no vendored package                                |
| 1     | P0             | Support fixture-only adoption and installed-package typing     | 0                                                   | Typed React/Svelte loaders, minimum-Node CI, installed consumer tests                     |
| 2     | P0             | Define and verify execution reset semantics                    | 1                                                   | Controls, remount, replay and navigation conformance; bounded HMR contract                |
| 3     | P1             | Improve baseline MSW diagnostics and dogfood network lifecycle | 2                                                   | One real consumer scenario covers loading, success, intended error and unexpected failure |
| 4     | Conditional P1 | Prototype instance-aware execution; decide go/no-go            | 3 and demonstrated concurrent lifecycle demand      | Stable mount identity and independently owned resources                                   |
| 5     | Conditional P1 | Support additional Docs lifecycle modes                        | 4 go decision                                       | Conflicting network mocks isolated; unsupported modes fail clearly                        |
| 6     | P1             | Establish environment and data contracts                       | 1; shared environment mutation also needs isolation | Reproducible locale/time examples and model validation                                    |
| 7     | P2             | Improve agent inspection and durable scenario documentation    | 2–3; instance selection needs 4                     | Explain blockers and associate evidence with source revision                              |
| 8     | P2             | Broaden compatibility and optimize distribution                | Earlier contracts stable                            | Tested version matrix and measured import/bundle costs                                    |

P0 means friction or correctness in the immediate adoption path. P1 closes
important lifecycle/isolation gaps. P2 increases reach after the contracts are
stable. Small documentation and packaging corrections can ship alongside any
milestone without reopening its scope.

## 0. Finish distribution and dogfooding

Publish only the audited 0.1.0 package built from the passing release revision.
Confirm registry integrity matches the audited artifact. Replace the service's
file dependency with exact `@juxtapose/scenarios: 0.1.0`, remove vendor files,
regenerate its lockfile, and run its actual browser suite against that install.
Keep source visibility unchanged. Record release notes and the source tag.

After the first release, document a repeatable publishing procedure with exact
revision, verification, contents audit, tag, and registry check. Evaluate trusted
publishing against npm's supported repository and provenance requirements; do not
make a private repository public merely to enable a publishing mechanism.

Exit: fresh CI can install the service without a neighboring checkout or tarball.
A new patch release can follow the same documented procedure without ad hoc steps.

Distribution update (2026-11-01): 0.1.0 is published on npm with its audited
artifact checksum, and the service registry-dependency update passed typing,
lint, its build, 310 unit tests, and 63 browser tests. The service PR removes the
vendored package; its CI remains a separate final integration check.

## 1. Support fixture-only use directly

Promote the useful pattern discovered during the Svelte service pilot into a small
public helper. It should materialize fresh typed data without installing a global
bridge or reserving an MSW host. Keep core loading renderer-independent; keep
Storybook annotations in the Storybook entry point.

Define whether fixture-only definitions exclude setup callbacks, or reject such
callbacks at runtime. Do not run setup and immediately dispose resources that a
component expects to use after rendering. Expose cleanup failures if any temporary
execution is used internally. Preserve scenario ID, seed, reference instant and
factory key/version information for inspection without exposing fixture values.

Provide a typed Storybook recipe for `loaded` values and component props. Avoid
requiring application code to recover types from Storybook's permissive loaded
record. Distinguish input-changing controls from display-only controls. Demonstrate
both fresh loads and variant selection when loaders do not rerun on args updates.

Add minimum-supported-Node CI and a TypeScript consumer compiled against the
installed package artifact now. Test public entry-point declarations outside the
source checkout so workspace paths and skipLibCheck cannot hide consumer errors.

Use actual Project/RunDetail adoption feedback to simplify the API. Keep static
fixtures valid; random generation is optional. Do not migrate decorative stories
just to increase usage counts.

Exit: React and Svelte examples render Canvas and multiple Docs stories; data is
equal for identical inputs, independently mutable per load, and variant changes
work without reloading the page. Compiler tests cover the public helper's inferred
fixtures and invalid overrides. Service wrappers can be removed in favor of it.

## 2. Make reset and replay reliable

Write a transition table before changing implementation: initial mount, args-only
render, explicit reset, play replay, same-story remount, navigation away/back,
setup edit/HMR, failure, and disposal. Define which actions reuse fixture data and
which allocate a new execution ID. A display-only rerender should not silently
reset application state; a requested fresh run must actually be fresh.

Bind play and readiness to the execution that began the operation. A matching
story ID alone cannot establish that an old callback belongs to a newer run.
Ensure superseded setup and delayed checkpoints cannot publish readiness. Preserve
failure diagnostics until they can be associated with their execution.

Offer one explicit fresh-run operation using supported Storybook lifecycle APIs.
Respect Storybook hook ordering and return cleanup normally. Verify how existing
preview/meta setup composes with generated annotations; detect or clearly explain
an overwritten generated hook. Avoid private manager events unless no supported
alternative exists and the dependency is deliberately version-bounded.

Exit: browser tests exercise every transition in React and Svelte, including rapid
navigation, delayed setup, a failed run followed by replay, and a late callback
from an old same-story run. Each resource disposes once; failure never becomes
ready without creating a new execution. HMR is either covered or remains an
explicitly unsupported operation with a usable reset instruction.

## 3. Strengthen baseline MSW integration and dogfood lifecycle

Keep one explicit handler owner per host until a safe alternative is demonstrated.
Document how existing worker startup and baseline handlers delegate to Scenarios.
Provide precise diagnostics for missing startup callbacks and conflicting owners.
Add a migration recipe for projects using another Storybook MSW integration.

Separate intentional HTTP errors and transport errors from unexpected failures.
Investigate supported MSW hooks and a narrow handler wrapper for explicit outcome
classification. Do not label an expected error scenario as broken, or promise
that an event reports transport failures it does not actually observe.

Provide optional utilities for connecting application-owned abort controllers to
the execution signal. Test with the real generated client. Keep the limitation
for arbitrary promises that ignore cancellation explicit. Add scoped render/play
failure reporting where supported; global errors without provenance must not be
assigned to whichever execution happens to be active.

Multi-instance attribution is conditional follow-up after milestone 4; it does
not block baseline singleton diagnostics or the first network-backed consumer.

Keep a bounded, sanitized diagnostic history with event time/order, execution ID,
checkpoint or handler identity, and outcome category. Omit request bodies,
credentials, queries and fixture data by default. Avoid building a full network
trace before actual debugging needs justify it.

Exit: intended 4xx/5xx and intentional transport failures can be reviewed; an
unexpected exception or late response cannot silently pass a new run. Disposal
and worker baseline restoration remain correct after failure and rapid navigation.

Dogfood one actual application scenario using its real typed client and scenario
fixtures. Cover held loading, success, an intended HTTP or transport error, and an
unexpected request. Connect it to the external capture consumer's named readiness
protocol. Exercise reset, navigation, late requests, and failure diagnostics in the
consumer browser suite before deciding to redesign ownership.

Exit also requires this consumer evidence, rather than only the synthetic workbench.

## 4. Introduce execution identity per mounted instance

Start with a bounded design spike and a go/no-go decision. Require a concrete
consumer that needs concurrent mounted lifecycles; fixture-only Docs is already
supported. If isolated previews meet the need, retain singleton canvas ownership
and defer a registry and protocol migration. Do not build an abstraction solely
to remove an explicit support limitation.

If the spike justifies the work, replace module-level single-active ownership
with an instance registry. Prototype
how the Storybook adapter obtains a stable mount identity before choosing its
public API. Story ID is not sufficient when a story mounts twice.

Bind fixture/provider access to an explicit execution or render context. The
zero-argument `current()` shape cannot select between simultaneous mounts; keep
it for unambiguous single-canvas use or provide a migration, rather than guessing.
Avoid embedding a process-local execution object into serialized args or metadata.

Evolve the read-only inspection protocol with explicit version handling. Support
listing instances and selecting an execution by identity. Retain `getActive()`
only where its meaning is unambiguous. Bound retained failures and remove disposed
instances without discarding diagnostics needed by an active capture.

Exit: two instances of the same story and two different stories can mount,
checkpoint and dispose independently. Inspectors never receive arbitrary fixture
payloads. Existing single-canvas consumers either remain compatible or receive a
documented protocol migration with contract tests.

## 5. Make Docs support match resource ownership

Do not remove the Docs guard merely because the registry supports multiple entries.
Independent execution records do not isolate shared worker handlers, module state,
local storage, or a patched application clock.

Support concurrent fixture-only Docs first. Then support lifecycle Docs with
resources scoped to each instance where that isolation can be proven. Use separate
preview documents for networked stories that need conflicting handlers. Verify
MSW client ownership across those documents; an iframe alone is not proof that
all application resources are isolated.

For inline Docs with incompatible shared resources, return a useful error naming
the conflict and the isolated rendering alternative. Do not infer ownership from
URL paths when two stories call the same endpoint, or alter production clients
with hidden correlation headers just to make concurrent mocks appear to work.

Exit: a Docs page with two copies of one story and another story behaves correctly
through mount/unmount and interaction. Conflicting responses for the same endpoint
remain isolated in supported network Docs mode. Unsupported inline combinations
fail clearly without corrupting another story.

## 6. Improve reproducibility without hidden global changes

Separate declared environment metadata from enforced browser settings. Offer a
consumer recipe for locale, timezone, reduced motion, fonts and asset readiness.
Allow an injectable application clock/provider; keep page-global clock and random
patches opt-in and restricted to isolated documents.

Make supported Faker locale configuration explicit. Include effective locale,
Faker version, seed algorithm and factory versions in reproduction metadata.
Demonstrate date generation with explicit reference dates. Preserve streams when
unrelated fixtures are added or reordered; document which changes intentionally
change output. IDs are deterministic, not collision-free guarantees.

Keep generated Orval models and project-owned factories separate. Add a recipe for
schema validation at the mock-response boundary using consumer-provided schemas
or validators. Generated TypeScript types alone do not validate runtime responses.
Keep the library free of a mandatory schema framework. Explain deliberate invalid
payload scenarios as an explicit exception to contract validation.

Keep plain-data fixture limits and finite JSON metadata deliberate. Document how
to construct application-specific classes in providers after loading plain data.
Broaden value support only for a concrete consumer requirement.

Exit: locale/timezone examples render consistently across repeated runs; the clock
contract is visible to reviewers; generated-client examples detect incompatible
mock payloads. No supported environment helper silently affects another Docs story.

## 7. Make inspection useful for agents and human review

Expose declared scenario purpose, named checkpoints, effective deterministic
inputs, resource ownership and current failure/blocker in a versioned record.
Add optional scenario revision or consumer-supplied build revision metadata.
Never imply that an ID or seed hashes callback behavior or proves two builds equal.

Generate a compact scenario catalog from explicit metadata and Storybook's public
story index where possible. Do not execute arbitrary setup merely to list stories.
Build an agent workflow that selects a scenario and execution, waits for a named
checkpoint, captures through an external tool, and records the source revision and
selected execution alongside evidence. No image comparison or approval engine
belongs in this package.

Give consumers useful errors: which checkpoint is missing, what failed, whether
the run was replaced, and whether instrumentation is absent. A later failure must
invalidate earlier readiness. Any interactive inspector should read the same
protocol, not introduce a second source of truth.

Exit: an agent can reproduce a reported state and explain why it is not ready;
a reviewer can see which state was captured and which build produced it. Metadata
excludes fixture values and secrets. Capture consumers test identity both before
and after taking evidence and retain their own paint/asset barriers.

## 8. Expand compatibility based on measured demand

Publish a capability matrix for fixture core, canvas lifecycle, inline Docs,
isolated network Docs and each browser/framework combination. Test the minimum
and latest versions actually claimed; do not widen peer ranges based on compilation
alone. Add Vue or other frameworks when there is a consuming project.

Extend the isolated tarball consumer test to compile a real installed TypeScript
consumer and build React/Svelte Storybook examples outside the source checkout.
Maintain the minimum-Node and installed-consumer checks introduced in milestone 1.
Add Firefox/WebKit when browser
lifecycle differences need coverage; pixel comparison remains outside scope.

Measure fixture-core import cost, Faker/locale contribution, installed size, and
Storybook incremental build overhead. Keep optional integrations out of core.
Optimize measured hot paths or bundling before adding package splits. Record
compatibility and migration notes for dependency upgrades.

Exit: the published package's documented compatibility is independently reproduced
from its registry artifact, with cost measurements and no hidden workspace imports.

## Suggested delivery slices

1. Finish 0.1.0 distribution and registry-backed service adoption.
2. Ship the fixture-only public path, React/Svelte examples, minimum-Node CI, and
   installed-package type tests.
3. Ship reset/replay semantics and the two-framework lifecycle conformance suite.
4. Improve baseline MSW diagnostics and add one real consumer network-backed
   scenario with the shared capture-readiness protocol.
5. Use the consumer evidence for a bounded instance-identity design spike. Proceed
   with a registry/protocol migration and additional Docs modes only on a go decision.
6. Improve environment/data contracts independently where safe; shared mutations
   require demonstrated isolation. Add multi-instance failure attribution if needed.
7. Add the agent catalog/reproduction workflow, then broaden the measured matrix.

The conditional design work requires an API review before implementation. Later
slices are proposals, not commitments to a fixed release number or calendar
estimate. Refresh priorities after the service has exercised fixture loading and
one real network-backed scenario. Deliberate boundaries such as plain-data
fixtures, external paint readiness, and cooperative cancellation are documented
contracts, not promises to make arbitrary application behavior deterministic.

## Reference constraints

Storybook documents setup/cleanup through returned `beforeEach` cleanup functions:
https://storybook.js.org/docs/writing-tests/interaction-testing

MSW request handlers execute in the client; resource isolation needs to account
for the host/client boundary, not just worker registration:
https://github.com/mswjs/msw

npm's provenance and trusted publishing requirements should be checked when
choosing automated publishing for a private source repository:
https://docs.npmjs.com/generating-provenance-statements/
https://docs.npmjs.com/trusted-publishers/
