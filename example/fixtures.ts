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

export function billingScenario(id: string) {
  return defineScenario({
    id,
    description: `Billing: ${id}`,
    seed: "billing-demo",
    now: "2026-01-15T12:00:00.000Z",
    flags: { showPayButton: true },
    experiments: { paymentCopy: "standard" },
    fixtures: (context) => ({
      customer: context.factory("customer", customer),
      invoice: context.factory("invoice", invoice),
    }),
  });
}
