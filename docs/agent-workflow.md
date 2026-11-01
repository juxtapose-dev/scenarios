# Catalog, inspection, and evidence metadata

These helpers are available in the next release after 0.2.1 from
`@juxtapose/scenarios/inspection`. This entry point has no runtime dependency on
Faker, Storybook, MSW, or Juxtapose. It assesses typed protocol-v1 observations;
it is not a validator for arbitrary untrusted JSON.

## An explicit catalog

Create a catalog from descriptors, not by importing every CSF module or executing
fixtures/setup just to list available states:

```ts
import { describeScenario } from "@juxtapose/scenarios";
import { createScenarioCatalog } from "@juxtapose/scenarios/inspection";

export const catalog = createScenarioCatalog([
  { storyId: "billing--overdue", scenario: describeScenario(overdueAccount) },
]);
```

Catalogs are sorted by story ID, reject duplicate IDs, and return detached data.
Multiple stories can reference one scenario (for example fixture-only variants).
A scenario ID alone does not identify a particular Storybook variant or args.
Use explicit story IDs and record capture args separately when they affect output.
Keep catalog modules free of network/module side effects. The billing
`example/catalog.ts` demonstrates the pattern.

For human labels, call `resolveScenarioCatalog(catalog, indexJson)` with the built
Storybook public `/index.json`. It validates the tested index-v5 format, requires
each catalog ID to resolve to a story, and copies only `title` and `name`. Missing
IDs and unsupported index versions fail clearly; source/import paths are excluded.
Run `pnpm build:storybook:react` followed by `pnpm --silent catalog:example` in the source
checkout to print the example catalog. The exporter loads only the explicitly
authored metadata module. `pnpm verify` also validates this catalog against the
built Storybook index, so renamed/missing stories fail the quality gate.
The index does not contain arbitrary scenario parameters; the explicit catalog
provides that metadata. The resolver accepts unknown JSON and validates the fields it uses. No private Storybook manager events or source paths are
needed. Export the resulting finite JSON through the consumer's chosen build step.

## Select, inspect, then capture

Install `installScenariosBridge()` from `@juxtapose/scenarios/storybook` in your
Storybook preview configuration so instrumentation exists before preparation.
Read the bridge from the **preview document**, not the manager. `undefined`
means absent instrumentation after preview initialization; `null` means an
installed bridge with no execution. Wait for preview initialization before
classifying an absent bridge as a configuration failure.
Fixture-only stories have no mounted readiness lifecycle and therefore no active
execution; inspect their catalog metadata and use your capture tool's own readiness.

```ts
import { inspectScenario, createScenarioEvidence } from "@juxtapose/scenarios/inspection";

const observed = await preview.evaluate(() => window.__JUXTAPOSE_SCENARIOS__?.getActive());
const assessment = inspectScenario(observed, { storyId: "billing--overdue" });
```

The assessment has `status` (`waiting`, `blocked`, `ready`), a stable `code`, a
human-readable `message`, the observed execution ID when present, and pending
required checkpoint names. Default required checkpoints are the declaration's
`checkpoints` plus `play-complete`. Pass an explicit list to select a different
named capture state; `play-complete` is always required. Any running/failed
checkpoint, diagnostics, failure or disposal prevents acceptance. A late failure
invalidates previously reached readiness.

Consumer workflow:

1. Select a catalog story in an isolated preview. Bound the entire wait (for
   example ten seconds); do not retry forever.
2. Wait for the correct story and pin its execution ID once observed. Poll
   `inspectScenario(observed, { storyId, executionId, checkpoints })` until ready.
   Stop on `blocked`; report its code/message and the snapshot diagnostics.
   A different story is `waiting` before selection, but `blocked` after an
   execution ID has been pinned.
3. Apply your font, asset, layout, animation and paint barriers. Read and assess
   again with the pinned ID immediately before capture.
4. Create evidence metadata with `createScenarioEvidence(observed)`. This requires
   `sourceRevision` supplied to `withScenario`, or an explicit external build
   revision passed to the helper. Conflicting revisions are rejected.
5. Capture with your external tool. Read and assess again with the pinned ID.
   If replaced/disposed/failed, discard the image and its metadata. If the build
   revision changed, discard the evidence too. Store the metadata only after
   these checks, alongside the tool's effective environment and selected args.

The helper creates metadata; it does not take screenshots or atomically bind them
to execution state. It never compares images or approves a review. Reset/remount
produces a new execution ID, so an old capture must not be attributed to that run.

## Durable records and privacy

Evidence metadata includes protocol version, story/execution IDs, source revision,
descriptor, executed factory versions (when supported by the observed release),
and required checkpoint names. It excludes fixture payloads and network data.
Protocol v1 remains compatible with 0.2.1 observations; factory/source-revision
fields are additive. For an older observation, provide the source revision
externally; unknown factory records remain unknown.

Descriptions, seeds, environment metadata, revisions, and diagnostics are authored
by your application. Do not put secrets in them. The package does not upload or
persist a catalog or record. Consumers decide storage, retention, redaction, and
publication. A descriptor or seed is not a hash of callbacks or a guarantee of
identical pixels across builds. Store source/build identity and environment too.
