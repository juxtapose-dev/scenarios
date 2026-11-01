# Changelog

## 0.3.0 — 2026-11-01

- Record executed factory keys/versions, optional scenario and source revisions,
  and declared capture checkpoints. Protocol v1 remains compatible with older
  observations; fixture values are excluded from inspection metadata.
- Add the lightweight `@juxtapose/scenarios/inspection` entry point: explicit
  catalogs, Storybook public-index resolution, readiness explanations, and
  evidence metadata tied to a build revision. Pinned captures stop when their
  story or execution changes, fails, or is disposed.
- Defer Faker loading until preparation while preserving English-only tree
  shaking and existing fixture streams. Generator loading is bounded and
  abortable, and failures retain preparation diagnostics.
- Add executable Orval/MSW response validation and injected-clock examples,
  plus guides for reproducibility, runtime contracts, and agent capture workflows.
- Measure package/import/bundle costs and guard against accidental inclusion of
  additional Faker locales or framework runtimes.
- Introduce manually triggered, verified-artifact releases through npm Trusted
  Publishing, with registry integrity verification and resumable release records.

Existing factory and Storybook APIs remain supported. The new inspection helpers
require `play-complete` plus declared/requested checkpoints; capture tools still
own font, asset, layout, and paint checks. Concurrent lifecycle Docs, additional
Faker locales, feature flags, and experiments remain outside the supported scope.

## 0.2.1 — 2026-11-01

Fix reentrant disposal: an abort listener that calls `dispose()` again now shares
the original cleanup promise. Async cleanup runs exactly once in reverse order,
including when a cleanup fails. Add regression coverage for reentry, concurrent
calls, promise identity and failure retention.

## 0.2.0 — 2026-11-01

- Add `startMswWorker` to wire browser startup and strict unhandled-request
  reporting, with actionable handler ownership diagnostics and migration guidance.
- Verify intentional transport errors and cancellation of held handlers without
  attributing expected teardown exceptions to replacement scenarios.

- Bind mounted Storybook execution to its public render signal. Args rerenders
  preserve state/readiness; remount and Rerun create a fresh run. Stale play
  contexts cannot verify a newer execution.
- Add cancellation support to `prepareScenario(definition, { signal })`.

- Add `loadScenarioFixtures` and Storybook `withFixtures` for typed data-only
  stories, including independent concurrent Docs instances and Controls examples.
- Verify React and Svelte fixture loading in real Storybook browser tests.
- Compile isolated package consumers with TypeScript 6 and 7, and verify the
  minimum supported Node version in CI.

Direct callers of the generated lifecycle hooks must now pass the same
`abortSignal` to `beforeEach` and `play` for a mount. Normal Storybook usage
supplies it automatically. A new signal represents a fresh mount.

## 0.1.0 — 2026-11-01

Initial release with typed scenario definitions, versioned factories, isolated
seeded Faker data, fixed reference dates, and fresh fixture data per execution.

Includes bounded setup, readiness checkpoints, reverse cleanup, a Storybook
canvas adapter and inspection bridge, and optional MSW 3 handler ownership,
unhandled-request diagnostics, and response gates.

The conformance workbench exercises an Orval-generated client. Full lifecycle
coverage targets Storybook 10.6.5, React 19.3.1, MSW 3.0.3, and Chromium. See the
README for Docs, reset, cancellation, and determinism limits. Feature flags and
experiments are outside this release's scope.
