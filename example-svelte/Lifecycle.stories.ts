import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { defineScenario } from "../src/index.js";
import { withScenario } from "../src/storybook.js";
import LifecycleCard from "./LifecycleCard.svelte";

function scenario(id: string) {
  return defineScenario({
    id,
    seed: "svelte-lifecycle",
    now: "2026-01-15T12:00:00.000Z",
    fixtures: () => ({ values: ["original"] }),
  });
}
const stable = withScenario(scenario("svelte-lifecycle"));
let firstAttempt = true;
const recovery = withScenario(scenario("svelte-recovery"), {
  setup() {
    if (firstAttempt) {
      firstAttempt = false;
      throw new Error("Intentional first setup failure");
    }
  },
});
const meta: Meta<typeof LifecycleCard> = {
  title: "Svelte Lifecycle",
  component: LifecycleCard,
  tags: ["!autodocs"],
  argTypes: { fixture: { control: false }, label: { control: "text" } },
  render: (args, context) => {
    const run = context.id.endsWith("--recovery") ? recovery.current() : stable.current();
    return { Component: LifecycleCard, props: { ...args, fixture: run.fixtures } };
  },
};
export default meta;

type Story = StoryObj<{ label: string }>;
export const Stable: Story = { ...stable.annotations, args: { label: "Lifecycle" } };
export const Recovery: Story = { ...recovery.annotations, args: { label: "Recovery" } };
