# Changelog

## Unreleased

- Add `loadScenarioFixtures` and Storybook `withFixtures` for typed data-only
  stories, including independent concurrent Docs instances and Controls examples.
- Verify React and Svelte fixture loading in real Storybook browser tests.
- Compile isolated package consumers with TypeScript 6 and 7, and verify the
  minimum supported Node version in CI.

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
