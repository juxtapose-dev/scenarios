import { defineFactory, defineScenario } from "../src/index.js";
import type { Customer, Invoice } from "./generated/models/index.js";

const customer = defineFactory<Customer>({
  version: "1",
  build: ({ faker }) => ({
    id: "customer-ada",
    name: "Ada Rivera",
    email: faker.internet.email({ firstName: "Ada", lastName: "Rivera" }),
  }),
});
const invoice = defineFactory<Invoice>({
  version: "1",
  build: () => ({
    id: "invoice-101",
    customerId: "customer-ada",
    amountDue: 12500,
    status: "overdue",
  }),
});

export function billingScenario(id: string, checkpoints: readonly string[] = ["loaded"]) {
  return defineScenario({
    id,
    revision: "1",
    checkpoints,
    description: `Billing: ${id}`,
    seed: "billing-demo",
    now: "2026-01-15T12:00:00.000Z",
    fixtures: (context) => ({
      customer: context.factory("customer", customer),
      invoice: context.factory("invoice", invoice),
    }),
  });
}
