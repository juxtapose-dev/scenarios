import { defineFactory, defineScenario } from "../src/index.js";

const customer = defineFactory({
  version: "1",
  build: ({ faker }) => ({
    name: "Ada Rivera",
    email: faker.internet.email({ firstName: "Ada", lastName: "Rivera" }),
  }),
});
export function cardScenario(id: string) {
  return defineScenario({
    id,
    seed: "svelte-fixture-demo",
    now: "2026-01-15T12:00:00.000Z",
    fixtures: (context) => ({ customer: context.factory("customer", customer) }),
  });
}
