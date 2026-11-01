import { withFixtures } from "@juxtapose/scenarios/storybook";
import type { Renderer, StoryAnnotations } from "storybook/internal/types";
import { scenario } from "./core.js";

const provider = withFixtures(scenario);
export const story: StoryAnnotations<Renderer> = {
  ...provider.annotations,
  render: (_args, context) => {
    const enabled: string = provider.read(context).person.enabled;
    return enabled;
  },
};
