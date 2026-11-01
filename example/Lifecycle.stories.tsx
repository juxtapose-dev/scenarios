import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { defineScenario } from "../src/index.js";
import { withScenario } from "../src/storybook.js";

function LifecycleCard({ label, fixture }: { label: string; fixture: { values: string[] } }) {
  const [changes, setChanges] = useState(0);
  return (
    <article>
      <h2>{label}</h2>
      <p>Fixture values: {fixture.values.length}</p>
      <p>Local changes: {changes}</p>
      <button
        type="button"
        onClick={() => {
          fixture.values.push("changed");
          setChanges((value) => value + 1);
        }}
      >
        Change state
      </button>
    </article>
  );
}
const scenario = defineScenario({
  id: "react-lifecycle",
  seed: "react-lifecycle-v1",
  now: "2026-01-01T00:00:00.000Z",
  fixtures: () => ({ values: ["original"] }),
});
const stable = withScenario(scenario);
let firstAttempt = true;
const recovery = withScenario(scenario, {
  setup() {
    if (firstAttempt) {
      firstAttempt = false;
      throw new Error("Intentional first setup failure");
    }
  },
});
const meta = {
  title: "React Lifecycle",
  component: LifecycleCard,
  argTypes: { fixture: { control: false }, label: { control: "text" } },
} satisfies Meta<typeof LifecycleCard>;
export default meta;
type Story = StoryObj<{ label: string }>;
export const Stable: Story = {
  ...stable.annotations,
  args: { label: "Lifecycle" },
  render: (args) => <LifecycleCard {...args} fixture={stable.current().fixtures} />,
};
export const Recovery: Story = {
  ...recovery.annotations,
  args: { label: "Recovery" },
  render: (args) => <LifecycleCard {...args} fixture={recovery.current().fixtures} />,
};
