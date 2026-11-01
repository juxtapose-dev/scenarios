import { withFixtures, withScenario } from "@juxtapose/scenarios/storybook";
import type { Renderer, StoryAnnotations } from "storybook/internal/types";
import { scenario } from "./core.js";

const lifecycle = withScenario(scenario, {
  setup: (execution) => {
    const name: string = execution.fixtures.person.name;
    execution.fixtures.person.name = name.toUpperCase();
  },
  play: (context, execution) => {
    const enabled: boolean = execution.fixtures.person.enabled;
    context.canvasElement.dataset.enabled = String(enabled);
  },
});
export const Lifecycle: StoryAnnotations<Renderer> = { ...lifecycle.annotations };

const fixtures = withFixtures(scenario);
export const FixtureOnly: StoryAnnotations<Renderer> = {
  ...fixtures.annotations,
  render: (_args, context) => {
    const name: string = fixtures.read(context).person.name;
    return name;
  },
};
