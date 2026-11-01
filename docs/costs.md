# Measured costs and adoption ergonomics

Measurements are local observations, not support/performance guarantees. Run
`pnpm measure` for package size, bundles, and five fresh-process import samples.
Add `-- --storybook` to compare three alternating builds of a minimal React story
with and without fixture loading. The script creates temporary files, cleans them,
and prints JSON. It does not publish or upload anything.
`pnpm check:costs` (included in verification) guards total core bundle size at
180 KB gzip and inspection at 4 KB gzip. These generous byte limits catch accidental
locale/runtime imports; no hardware-dependent timing limit is enforced.

## Representative measurements

Measured 2026-11-01 on macOS arm64, Node 26.11.1, Vite 8.3.5, Storybook 10.6.5,
Faker 10.6.0. Full correctness CI separately covers the minimum supported Node.
Sizes below use decimal KB and gzip, not installed dependency sizes.

| Artifact                                            |   JavaScript |         gzip |
| --------------------------------------------------- | -----------: | -----------: |
| Fixture core bundle, total including deferred Faker | about 463 KB | about 157 KB |
| Initial fixture core chunk                          | about 8.7 KB | about 3.0 KB |
| Deferred English Faker chunk                        | about 454 KB | about 154 KB |
| Faker + English locale alone                        | about 454 KB | about 154 KB |
| Inspection (catalog/readiness/evidence)             | about 4.5 KB | about 1.6 KB |

The measured library build includes exported functions and uses Vite's minified ES
library output. Gzip totals sum individual chunks, reflecting separate requests.
Application tree shaking, chunk sharing, compression, and which functions are
used affect actual delivery. This is not a browser download/startup benchmark.
Faker occupies about 2.9 MB of files installed; the Scenarios archive itself is
roughly 31 KB, about 105 KB unpacked (consumer guides included). Package archives
exclude tests, examples, OpenAPI/generated clients, and development plans.

Faker is now loaded at scenario preparation, rather than core-module import.
Five fresh Node process samples reduced the median core import from about 41 ms
to about 0.7 ms on this machine. That moves generator initialization to preparation;
it does not remove its total cost. Inspection imports take roughly 0.4 ms and
never load Faker. An aborted preparation rechecks cancellation after loading the
generator before running any fixture callback. Waiting for that module has a
five-second bound and responds to execution cancellation; loading failures remain
in the failed preparation snapshot.

Minimal Storybook build medians were about 0.76 s without and 0.78 s with fixture
loading, with roughly 407 KB more uncompressed output for the scenario build.
Observed timing differences were within run/order/cache noise; this is no evidence
of a build-speed improvement or a universal zero-cost integration. These are
clean static builds with warm OS/dependency caches, no Docs addon and one story.
They do not measure dev-server startup, HMR, per-story interactions, or a large
consumer application's incremental build. Measure those in the consuming project
before promising a development-speed gain or adding performance budgets.

## Decisions from the measurements

- Keep inspection independent of core runtime imports. Catalog/readiness tools
  should not load Faker merely to explain a scenario.
- Defer the generator import until preparation. Descriptor-only work stays cheap
  without a new package or changed fixture callback API.
- Keep the pinned English locale and isolated generators. A global Faker instance
  would undermine reproducibility for little justified benefit.
- Do not add a package split or optional generator plugin yet. Faker dominates
  total fixture cost; a future static-only entry point needs actual consumer demand
  and a measured benefit, rather than more installation/API choices by default.

## Service adoption review

The service's Project and RunDetail stories each use one `withFixtures` helper,
spread normal Storybook annotations, and read inferred data in render. Variant
selection remains explicit in args. The network-backed review harness uses the
real client and one worker/session owner. The local fixture-loader wrapper was
removed in the earlier adoption batch.

Remaining repetition is ordinary Storybook configuration (render props, layouts,
Controls). A generic wrapper would hide framework typing and hook/parameter
composition, so this batch keeps those lines explicit. The actionable gaps were
adoption documentation, reproducibility metadata, runtime response validation,
and useful agent inspection; each now has a concrete API or executable recipe.
No service code or private service data is shipped in this package.
