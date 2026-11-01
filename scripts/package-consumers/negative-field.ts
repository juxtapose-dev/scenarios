import { loadScenarioFixtures } from "@juxtapose/scenarios";
import { scenario } from "./core.js";

const fixtures = await loadScenarioFixtures(scenario);
export const missing = fixtures.person.missing;
