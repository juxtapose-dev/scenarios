import type { Meta } from "@storybook/react-vite";
import { defineScenario } from "../src/index.js";
import { withFixtures } from "../src/storybook.js";
import { Environment, fixedClock } from "./Environment.js";

const scenario = defineScenario({
  id: "environment/fixed-time",
  revision: "1",
  seed: "environment-v1",
  now: "2026-01-15T12:00:00.000Z",
  environment: { locale: "en-GB", timeZone: "Europe/London", reducedMotion: "reduce" },
  fixtures: () => ({ referenceInstant: "2026-01-15T12:00:00.000Z" }),
});
const data = withFixtures(scenario);
export default { title: "Environment", component: Environment } satisfies Meta<typeof Environment>;
export const FixedTime = {
  ...data.annotations,
  render: (_args: unknown, context: { loaded: Record<string, unknown> }) => (
    <Environment
      clock={fixedClock(data.read(context).referenceInstant)}
      locale="en-GB"
      timeZone="Europe/London"
    />
  ),
};
