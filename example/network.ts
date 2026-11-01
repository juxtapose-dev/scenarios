import { setupWorker } from "msw/browser";
import { HttpResponse, http } from "msw/http";
import type { ExecutionObserver } from "../src/index.js";
import { createResponseGate, startMswWorker } from "../src/msw.js";
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

export type BillingMode = "success" | "empty" | "error" | "loading" | "paid" | "unexpected";
export async function attachBilling(
  execution: ExecutionObserver,
  fixtures: { customer: Customer; invoice: Invoice },
  mode: BillingMode,
) {
  const session = await start();
  const gate = createResponseGate(execution.signal);
  let invoice = fixtures.invoice;
  const handlers = [http.get("/api/customer", () => HttpResponse.json(fixtures.customer))];
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
        if (mode === "error")
          return HttpResponse.json({ error: "Invoice service unavailable" }, { status: 500 });
        return HttpResponse.json(mode === "empty" ? [] : [invoice]);
      }),
    );
  }
  handlers.push(
    http.post("/api/pay", () => {
      invoice = { ...invoice, status: "paid" };
      return HttpResponse.json(invoice);
    }),
  );
  session.attach(execution, handlers);
}
