# Working on Rehearsal

Keep this package independent of Juxtapose and focused on Storybook. Do not add
another renderer or a generic plugin framework without a concrete requirement.

Use strict TypeScript and preserve inference. No type assertions, explicit any,
non-null assertions, or TypeScript suppression directives. `pnpm check` enforces
this in authored and generated TypeScript with an AST scan.

Use Biome for lint and formatting. Generated API output is not hand-edited or
reformatted: update OpenAPI/configuration, run `pnpm generate`, and verify it with
`pnpm check:generated`.

Do not change lifecycle or MSW isolation based on unit tests alone. Build and run
the real Storybook conformance suite. Read the ownership contract in README.md.
Never silently reset someone else's worker or accept a stale execution as ready.

Run `pnpm verify` before delivery. Browser tests require a Playwright Chromium
installation. Keep browser traces, logs, screenshots, dependencies, and package
archives out of Git. Use synthetic fixtures only. Do not publish npm packages or
change repository visibility as part of routine development.
