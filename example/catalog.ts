import { describeScenario } from "../src/index.js";
import { createScenarioCatalog } from "../src/inspection.js";
import { billingScenario } from "./fixtures.js";

// Explicit declarations, not imports of CSF files with worker/module side effects.
export const catalog = createScenarioCatalog([
  { storyId: "billing--success", scenario: describeScenario(billingScenario("billing-success")) },
  {
    storyId: "billing--loading",
    scenario: describeScenario(billingScenario("billing-loading", ["loading"])),
  },
  {
    storyId: "billing--expected-error",
    scenario: describeScenario(billingScenario("billing-error")),
  },
]);
