import {
  defineFactory,
  defineScenario,
  loadScenarioFixtures,
  prepareScenario,
  type ScenarioDefinition,
} from "@juxtapose/scenarios";

const person = defineFactory({
  version: "1",
  build: ({ faker, now, id }) => ({
    id: id("person"),
    name: faker.person.fullName(),
    createdAt: now.toISOString(),
    enabled: true,
  }),
});
export const scenario = defineScenario({
  id: "consumer/core",
  seed: "consumer",
  now: "2026-01-01T00:00:00.000Z",
  fixtures: ({ factory }) => ({ person: factory("primary", person, { enabled: false }) }),
});

function fixtureLoader<T extends object>(definition: ScenarioDefinition<T>): Promise<T> {
  return loadScenarioFixtures(definition);
}
const fixtures = await fixtureLoader(scenario);
const name: string = fixtures.person.name;
const enabled: boolean = fixtures.person.enabled;
export const summary = `${name}: ${enabled}`;

const cancellable = await prepareScenario(scenario, { signal: new AbortController().signal });
await cancellable.dispose();
