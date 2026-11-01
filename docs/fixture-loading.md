# Fixture-only loading

Use fixture-only loading when a story needs reproducible data, without mounted
setup resources, checkpoints or network handler ownership.

## Core

```ts
import { defineScenario, loadScenarioFixtures } from "@juxtapose/scenarios";

const account = defineScenario({
  id: "accounts/overdue",
  seed: "account-v1",
  now: "2026-01-01T00:00:00.000Z",
  fixtures: () => ({ customer: { name: "Alex Morgan", balance: 42 } }),
});

const first = await loadScenarioFixtures(account);
const second = await loadScenarioFixtures(account);
```

Both results have the inferred fixture type and equal initial values. Their
nested data is independently mutable. `loadScenarioFixtures` does not install a
preview bridge, reserve an MSW host, or retain an execution after returning data.
It rejects definitions with a `setup` callback before invoking it. Use
`prepareScenario` or `withScenario` when resources must survive through rendering.

## Storybook

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { withFixtures } from "@juxtapose/scenarios/storybook";

const data = withFixtures(account);
const meta = {
  component: AccountCard,
  ...data.annotations,
  render: (args, context) => <AccountCard {...args} customer={data.read(context).customer} />,
} satisfies Meta<typeof AccountCard>;
export default meta;
```

For Svelte, put the shared loader and renderer on the component meta. The
renderer supplies the required fixture prop; individual stories supply only
control args:

```ts
import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { withFixtures } from "@juxtapose/scenarios/storybook";
import AccountCard from "./AccountCard.svelte";

const data = withFixtures(account);
const meta: Meta<typeof AccountCard> = {
  component: AccountCard,
  ...data.annotations,
  argTypes: { customer: { control: false, table: { disable: true } } },
  render: (args, context) => ({
    Component: AccountCard,
    props: { ...args, customer: data.read(context).customer },
  }),
};
export default meta;

type Story = StoryObj<{ label: string }>;
export const Default: Story = { args: { label: "Account" } };
```

Use your framework's `Meta` and `StoryObj` types. A required component prop
supplied by loaded fixtures is not an arg that every story needs to supply;
`StoryObj<YourControlArgs>` describes the independently controlled props.

`annotations` contains a standard loader and declared scenario metadata. It owns
neither `beforeEach` nor `play`. Each loader invocation creates independent data,
including when Docs mounts the same story more than once. `read(context)` retrieves
only the data associated with that helper's loader invocation. It does not infer
types from a permissive `loaded` record or consult global state.

Loaded data remains an ordinary inspectable object at
`context.loaded.juxtaposeScenarioFixtures`. The helper validates its origin before
returning it with the inferred type. Read the original render context; do not
serialize or deep-clone `loaded` and then pass the clone back to `read`.

## Controls and composition

Ordinary args updates can rerender without rerunning loaders. For supported
variants, load a map once and select its value during render:

```tsx
render: (args, context) => <AccountCard customer={data.read(context).variants[args.variant]} />;
```

That is a display selection, not a reset. If a control changes inputs that require
new fixtures, remount the story to load fresh data. Mutating fixture objects stays
local to that load and persists until it is replaced. Avoid mutating inputs in
normal application components; the conformance examples do so intentionally to
verify isolation.

For additional loaders, compose the standard arrays rather than overwriting them:

```ts
loaders: [...data.annotations.loaders, loadTheme],
parameters: { ...data.annotations.parameters, layout: "fullscreen" },
```

Use one combined scenario per story's fixture helper. Spreading another helper's
loader results over the reserved fixture slot produces an explicit mismatch error.
Declare dependent fixtures together or compose their factory functions normally.

## API choice

We compared a bare core helper, a typed loader/reader pair, and a callback wrapper
that would also own rendering. The core helper is useful outside Storybook but
alone leaves consumers to recover types from Storybook's loaded data. The
annotation/reader pair follows the existing `withScenario` convention and keeps
normal React/Svelte rendering and args composition. A render callback wrapper
would introduce extra argument and prop-merge rules; it is unnecessary here.

The accepted surface therefore has two entry points: `loadScenarioFixtures` in
core and `withFixtures` in the Storybook integration. Inline Docs support applies
to this data-only path. Full mounted lifecycle and shared MSW resources retain
their separate ownership restrictions.
