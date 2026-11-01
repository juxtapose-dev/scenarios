import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { defineFactory, defineScenario } from "../src/index.js";
import { withFixtures } from "../src/storybook.js";

const customer = defineFactory({ version: "1", build: () => ({ name: "Alex Morgan" }) });
const scenario = defineScenario({
  id: "fixtures/react",
  seed: "fixture-card-v1",
  now: "2026-01-01T00:00:00.000Z",
  fixtures: ({ factory }) => ({
    variants: {
      standard: factory("standard", customer),
      enterprise: factory("enterprise", customer, { name: "Enterprise customer" }),
    },
  }),
});
type Variant = "standard" | "enterprise";
function FixtureCard({ customer }: { customer: { name: string }; variant: Variant }) {
  const [, refresh] = useState(0);
  return (
    <article>
      <h2>{customer.name}</h2>
      <button
        type="button"
        onClick={() => {
          customer.name = "Changed locally";
          refresh((value) => value + 1);
        }}
      >
        Rename locally
      </button>
    </article>
  );
}
const data = withFixtures(scenario);
const meta = {
  title: "Fixtures/React",
  component: FixtureCard,
  tags: ["autodocs"],
  ...data.annotations,
  argTypes: {
    variant: { control: "select", options: ["standard", "enterprise"] },
    customer: { control: false, table: { disable: true } },
  },
  render: (args, context) => (
    <FixtureCard {...args} customer={data.read(context).variants[args.variant]} />
  ),
} satisfies Meta<typeof FixtureCard>;
export default meta;
type Story = StoryObj<{ variant: Variant }>;
export const Standard: Story = { args: { variant: "standard" } };
export const Duplicate: Story = { args: { variant: "standard" } };
