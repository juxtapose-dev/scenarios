import { defineFactory, defineScenario } from "@juxtapose/scenarios";

const person = defineFactory({ version: "1", build: () => ({ enabled: true }) });
export const scenario = defineScenario({
  id: "consumer/invalid-override",
  seed: "consumer",
  now: "2026-01-01T00:00:00.000Z",
  fixtures: ({ factory }) => ({ person: factory("primary", person, { enabled: "yes" }) }),
});
