import { setupWorker } from "msw/browser";
import { HttpResponse, http } from "msw/http";
import type { ExecutionObserver } from "../src/index.js";
import { createResponseGate, startMswWorker } from "../src/msw.js";
import {
  isCustomer,
  isInvoice,
  isInvoiceError,
  isInvoices,
  validateResponse,
} from "./contracts.js";
import type { Customer, Invoice } from "./generated/models/index.js";

const worker = setupWorker();
let started: ReturnType<typeof startMswWorker> | undefined;
function start() {
  started ??= startMswWorker(
    worker,
    { baselineHandlers: [], apiPrefixes: ["/api"] },
    { quiet: true },
  );
  return started;
}

export type BillingMode =
  | "success"
  | "empty"
  | "error"
  | "loading"
  | "paid"
  | "unexpected"
  | "invalid";
export async function attachBilling(
  execution: ExecutionObserver,
  fixtures: { customer: Customer; invoice: Invoice },
  mode: BillingMode,
) {
  const session = await start();
  const gate = createResponseGate(execution.signal);
  let invoice = fixtures.invoice;
  const handlers = [
    http.get("/api/customer", () =>
      HttpResponse.json(validateResponse("Customer", fixtures.customer, isCustomer)),
    ),
  ];
  if (mode !== "unexpected") {
    handlers.push(
      http.get("/api/invoices", async () => {
        if (mode === "loading") {
          try {
            await gate.wait();
          } catch (error) {
            if (execution.signal.aborted) return HttpResponse.error();
            throw error;
          }
        }
        if (mode === "invalid")
          return HttpResponse.json(
            validateResponse("Invoice[]", [{ ...invoice, status: "invalid" }], isInvoices),
          );
        if (mode === "error")
          return HttpResponse.json(
            validateResponse(
              "GetInvoices500",
              { error: "Invoice service unavailable" },
              isInvoiceError,
            ),
            { status: 500 },
          );
        return HttpResponse.json(
          validateResponse("Invoice[]", mode === "empty" ? [] : [invoice], isInvoices),
        );
      }),
    );
  }
  handlers.push(
    http.post("/api/pay", () => {
      invoice = { ...invoice, status: "paid" };
      return HttpResponse.json(validateResponse("Invoice", invoice, isInvoice));
    }),
  );
  session.attach(execution, handlers);
}
