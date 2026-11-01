# Orval, project factories, and validated MSW responses

Use three separate layers: generated API models/client, project-owned scenario
factories, and project-owned mock handlers. The real component calls the real
client; MSW intercepts its HTTP traffic. Scenarios owns reproducible fixture data
and mounted handler cleanup. Keep generated output disposable and never hand-edit it.

The checked-in synthetic billing example is executable:

1. `example/openapi.json` declares Customer, Invoice, and billing endpoints.
2. `pnpm generate` runs the pinned Orval configuration; `pnpm check:generated`
   detects generated drift.
3. `example/fixtures.ts` uses generated result types in versioned factories.
4. `example/contracts.ts` validates unknown JSON using project-owned type guards.
5. `example/network.ts` validates successful responses before returning them
   through MSW. `example/Billing.tsx` uses the generated client with cancellation.
6. `example/Billing.stories.tsx` exercises loaded, empty, held loading, payment,
   expected HTTP error, and deliberately unexpected request states.

## Typed factories

```ts
import type { Invoice } from "./generated/models";
import { defineFactory } from "@juxtapose/scenarios";

export const invoice = defineFactory<Invoice>({
  version: "1",
  build: () => ({
    id: "invoice-101",
    customerId: "customer-ada",
    amountDue: 12500,
    status: "overdue",
  }),
});
```

Explicit relationships and boundary values make reviews understandable. Faker is
optional. Do not import/reseed a global Faker singleton in generated mocks and
assume it shares Scenarios' stream isolation.

## Validate at the response boundary

Generated TypeScript models disappear at runtime. A fixture read from JSON, a
spread of an unexpected value, or drift in a schema can still violate the API.
Use your existing validator (such as a schema generated alongside your API), or
a project-owned guard. Scenarios adds no required validation framework.

```ts
function isInvoice(value: unknown): value is Invoice {
  if (value === null || typeof value !== "object") return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "customerId" in value &&
    typeof value.customerId === "string" &&
    "amountDue" in value &&
    typeof value.amountDue === "number" &&
    Number.isFinite(value.amountDue) &&
    "status" in value &&
    (value.status === "paid" || value.status === "overdue")
  );
}
function invoiceResponse(value: unknown) {
  if (!isInvoice(value)) throw new Error("Mock violates Invoice contract");
  return HttpResponse.json(value);
}
```

Attach a handler returning that response through your Scenarios MSW session.
A thrown validation error in an attached handler latches a scenario failure;
reviewers should see the contract failure, not accept the component's error UI as
successful mock setup. The example's small guards check required shape/enum and
integer amounts; they do not claim full OpenAPI conformance. If you need formats,
additional-properties rules, bounds, or recursive schemas, use a validator that
implements your contract and regenerate/check it with the API spec.

Validate documented error payloads with their own schemas. An intended 500 with a
valid error body is a legitimate error scenario. A deliberately malformed payload
scenario should explicitly bypass the normal response validator in that named
handler and assert the application's defensive behavior. Keep that exception
visible in review; never globally disable validation to make one story work.

## Loading and failures

Use `createResponseGate(execution.signal)` for a held loading response; observe a
named loading checkpoint. On disposal, the gate rejects. Catch intentional aborts
and return `HttpResponse.error()` without reporting them as an unexpected handler
exception. Use application-owned AbortControllers on unmount too.

Expected mocked HTTP errors do not fail the execution. Intentional transport
errors use `HttpResponse.error()`; MSW's events do not reliably classify those,
so explicitly report unexpected application transport failures through
`execution.fail`. Unhandled scoped requests and thrown attached handlers fail.
Do not use random delays or a replacement generated-client module as readiness.

See [MSW ownership and startup](msw-integration.md) for `startMswWorker`, baseline
handlers, startup configuration, and migration from `msw-storybook-addon`.
Do not give two integrations ownership of the same worker's handler resets.

## Acceptance checks for a consuming project

Run the actual generated client through MSW in a browser. Cover success, held
loading, expected error, contract mismatch, and disposal/navigation. Verify the
loading/error UI and named checkpoint, not only the handler's return value.
Keep generator drift checks separate from runtime response validation: both are
needed to catch different failures. Existing adapters and custom mutators can
remain; they must respect request cancellation and propagate failures.
