# Reproduction and inspection batch

Scope: reproducibility contracts, the Orval/MSW adoption path, read-only agent
inspection, and measured ergonomics/distribution costs. Release automation remains
for the next release. No publication or repository visibility changes in this batch.

1. Preserve existing English Faker streams and protocol-v1 consumers. Add executed
   factory key/version records, optional scenario revision, declared checkpoints,
   and a consumer-supplied source revision. Include failed preparation metadata.
2. Document environment declarations separately from enforcement. Demonstrate an
   injectable application clock and explicit locale/timezone formatting; never
   patch globals. Test repeated output across browser contexts.
3. Validate synthetic Orval mock responses with project-owned runtime guards.
   Exercise success, held loading, expected error and invalid response behavior
   through the actual generated client and MSW. No mandatory schema dependency.
4. Add a peer-free inspection entry point: explicit descriptor catalog, pure
   readiness assessment, and revision-associated evidence metadata. Require
   play-complete, reject replacement/failure/disposal, preserve protocol-v1 shape.
   Catalogs never discover by executing arbitrary CSF modules. Provide a public
   Storybook-index join recipe and a bounded capture workflow.
5. Measure installed and bundled size, cold core import, Faker's contribution,
   and comparable Storybook builds. Review service call sites for repetitive
   adoption code; simplify only where the evidence warrants it.

Plan review: avoid adding locale configuration until another locale is required;
English is an explicit supported setting, not ambient browser locale. Keep fixture
records on executions because definitions cannot know factory usage without
running code. Keep inspection free of runtime core imports so agents do not load
Faker. An execution ID and seed are not source hashes; evidence needs a revision
and identity checks before and after capture. No lifecycle/Docs ownership changes.

Acceptance: strict inferred typing and installed-package consumers, targeted
regressions and real-browser checks, audited package allowlist, reproducible cost
script, updated consumer guides and roadmap, then full pnpm verify.

## Verification

Full `pnpm verify` passed: 66 unit tests, 18 Chromium cases covering React/Svelte,
strict TypeScript 6/7 tarball consumers and negative diagnostics, generator drift,
and the 21-file publication allowlist. Browser checks include two locale/timezone
contexts and invalid response validation through the actual generated client/MSW.
`pnpm catalog:example` resolved explicit entries against the built public index.
Measurement scripts ran before/after deferred Faker loading; conclusions and
limitations are recorded in `costs.md`. No package was published for this batch.

Review corrections: generator loading is bounded and abortable with failure
snapshots; pinned captures stop on cross-story navigation; catalog entries strip
structurally permitted extra fields. Regressions include a real blocked-chunk
preparation timeout and recovery through a fresh browser load.

Re-measurement caught whole-namespace imports pulling in all Faker locales during
the loading fix. The loader now narrows the dynamic module inside its callback;
verification guards total core and inspection bundle sizes, without timing limits.
