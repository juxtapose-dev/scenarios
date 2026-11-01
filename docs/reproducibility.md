# Reproducing data and the application environment

These additions are available from 0.3.0. English (`en`) is
the supported Faker locale; it is independent of the browser's language. Each
named factory gets a new Faker instance with an independent seeded stream.
There is no ambient singleton to reseed.

## What identifies a reproduction

The descriptor records the scenario ID, authored description, seed, canonical UTC
reference instant, seed algorithm (`fnv1a-utf8-v1`), pinned Faker version, English
locale, declared environment, optional scenario revision, and declared checkpoints.
Executed snapshots additionally record each named factory key/version and an
optional source revision. Factory records are available even if later fixture
construction fails. `describeScenario` never builds fixtures, so it cannot list
factories that depend on runtime branches.

```ts
const invoice = defineFactory<Invoice>({
  version: "2",
  build: ({ faker, now, id }) => ({
    id: id("invoice"),
    customerId: "customer-ada",
    amountDue: 12500,
    status: "overdue",
    // For models with date fields, use now or faker.date with a fixed refDate.
  }),
});
const scenario = defineScenario({
  id: "billing/overdue",
  revision: "2",
  checkpoints: ["loaded"],
  seed: "billing-v1",
  now: "2026-01-15T12:00:00.000Z",
  environment: { locale: "en-GB", timeZone: "Europe/London" },
  fixtures: ({ factory }) => ({ invoice: factory("invoice:primary", invoice) }),
});
const story = withScenario(scenario, { sourceRevision: buildRevision });
```

`revision` is project-authored and optional. `sourceRevision` should identify the
actual build (for example a commit SHA, including a dirty-build identifier when
needed). Neither is inferred from callback code. A seed and factory version do
not prove equal source. Bump factory versions deliberately when their generated
output contract changes. Commit explicit values when they must survive generator
upgrades. Include overrides in source review: snapshot metadata does not hash them.

Adding/reordering unrelated named fixtures does not change an existing stream.
Changing its key, seed, version, or random draws can change its values. Adding a
new draw before an existing field can change that field. IDs are deterministic
conveniences, not a collision-free or cryptographic scheme. Execution IDs remain
random because they identify separate runs, not data content.

## Declare settings, then enforce them at the right boundary

`environment` is finite JSON metadata. It does not set browser preferences or
assert they were applied. Choose a project-owned shape, record the settings that
matter, and configure the application/browser independently:

| Concern                                              | Owner                                            |
| ---------------------------------------------------- | ------------------------------------------------ |
| Faker language/reference date                        | Scenarios (`en`, scenario `now`)                 |
| Application clock                                    | Inject a clock/provider with `now(): Date`       |
| Formatting language/timezone                         | Pass explicit locale and `timeZone` to `Intl`    |
| Browser language/timezone                            | Browser context or capture configuration         |
| Viewport, device scale, color scheme, reduced motion | Browser/capture configuration                    |
| Fonts and assets                                     | Application assets plus capture readiness checks |
| Timers, crypto, global randomness                    | Application dependencies; untouched by Scenarios |

The executable Environment example (`example/Environment.tsx` in the source checkout) injects a fixed
clock and uses explicit formatting. Its Storybook story loads plain data first,
then constructs the clock during render. The browser test runs it under US/Los
Angeles and German/Tokyo contexts and requires the same displayed instant.

```ts
interface ApplicationClock {
  now(): Date;
}
const clock: ApplicationClock = {
  now: () => new Date("2026-01-15T12:00:00.000Z"),
};
const formatted = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "short",
  timeStyle: "short",
}).format(clock.now());
```

Return a fresh Date so consumers cannot mutate the clock. For React, supply the
clock through props/context; for Svelte, props/context or an application store.
Avoid putting provider instances, functions, or custom classes in fixture data.

For capture tests, configure `locale`, `timezoneId`, `reducedMotion`, and viewport
on an isolated browser context. Record those effective settings with evidence.
Load stable local fonts; wait for `document.fonts.ready` and application assets.
A ready checkpoint is a semantic condition, not a paint/asset guarantee.
Do not patch page-global Date or randomness for inline Docs: other stories share
that document. Page-wide clock mocking, if a project requires it, belongs in an
isolated preview and its external test configuration.
