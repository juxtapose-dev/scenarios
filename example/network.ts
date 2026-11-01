import { setupWorker } from "msw/browser";
import { HttpResponse, http } from "msw/http";
import type { ExecutionObserver } from "../src/index.js";
import { createMswSession, createResponseGate, onUnhandledFrame } from "../src/msw.js";
import type { Customer, Invoice } from "./generated/models/index.js";

const worker = setupWorker();
const session = createMswSession(worker, { baselineHandlers: [], apiPrefixes: ["/api"] });
let started: Promise<unknown> | undefined;
function start() {
  started ??= worker.start({ onUnhandledFrame: onUnhandledFrame(session), quiet: true });
  return started;
}

export type BillingMode = "success" | "empty" | "error" | "loading" | "paid" | "unexpected";
export async function attachBilling(
  execution: ExecutionObserver,
  fixtures: { customer: Customer; invoice: Invoice },
  mode: BillingMode,
) {
  await start();
  const gate = createResponseGate(execution.signal);
  let invoice = fixtures.invoice;
  const handlers = [http.get("/api/customer", () => HttpResponse.json(fixtures.customer))];
  if (mode !== "unexpected") {
    handlers.push(
      http.get("/api/invoices", async () => {
        if (mode === "loading") await gate.wait();
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
