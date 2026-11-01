import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { withFixtures } from "../src/storybook.js";
import FixtureCard from "./FixtureCard.svelte";
import { cardScenario } from "./fixtures.js";

const data = withFixtures(cardScenario("svelte-first"));
const meta: Meta<typeof FixtureCard> = {
  title: "Fixture Card",
  component: FixtureCard,
  tags: ["autodocs"],
  argTypes: { customer: { control: false }, label: { control: "text" } },
  ...data.annotations,
  render: (args, context) => ({
    Component: FixtureCard,
    props: { ...args, customer: data.read(context).customer },
  }),
};
export default meta;

type Story = StoryObj<{ label: string }>;
export const First: Story = { args: { label: "First" } };
export const Second: Story = { args: { label: "Second" } };
