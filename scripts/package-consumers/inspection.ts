import { describeScenario } from "@juxtapose/scenarios";
import {
  createScenarioCatalog,
  createScenarioEvidence,
  inspectScenario,
  type ObservedScenario,
  resolveScenarioCatalog,
} from "@juxtapose/scenarios/inspection";
import { scenario } from "./core.js";

const catalog = createScenarioCatalog([
  { storyId: "consumer--core", scenario: describeScenario(scenario) },
]);
export function resolve(index: unknown) {
  return resolveScenarioCatalog(catalog, index);
}
const storyId: string | undefined = catalog.entries[0]?.storyId;
export const message: string = inspectScenario(null, {
  storyId: storyId ?? "consumer--core",
}).message;
export function evidence(observed: ObservedScenario) {
  const revision: string = createScenarioEvidence(observed, {
    sourceRevision: "consumer-build",
  }).sourceRevision;
  return revision;
}
