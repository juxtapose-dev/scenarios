import { useEffect, useRef, useState } from "react";
import { getCustomer, getInvoices, payInvoice } from "./generated/client.js";
import type { Customer, Invoice } from "./generated/models/index.js";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; customer: Customer; invoices: Invoice[] };
export function Billing({
  showPayButton = true,
  paymentCopy = "standard",
}: {
  showPayButton?: boolean;
  paymentCopy?: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    Promise.all([
      getCustomer({ signal: controller.signal }),
      getInvoices({ signal: controller.signal }),
    ])
      .then(([customer, invoices]) => {
        if (!controller.signal.aborted) setState({ kind: "ready", customer, invoices });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });
    return () => {
      controller.abort();
      if (lifetime.current === controller) lifetime.current = null;
    };
  }, []);
  async function pay() {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) return;
    try {
      const updated = await payInvoice({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setState((previous) =>
        previous.kind === "ready"
          ? {
              ...previous,
              invoices: previous.invoices.map((invoice) =>
                invoice.id === updated.id ? updated : invoice,
              ),
            }
          : previous,
      );
    } catch {
      if (!controller.signal.aborted) setState({ kind: "error" });
    }
  }
  if (state.kind === "loading") return <p role="status">Loading invoices…</p>;
  if (state.kind === "error") return <p role="alert">Unable to load invoices.</p>;
  return (
    <main>
      <h1>Billing for {state.customer.name}</h1>
      <p>{state.customer.email}</p>
      {state.invoices.length === 0 ? (
        <p>No invoices yet.</p>
      ) : (
        <ul>
          {state.invoices.map((invoice) => (
            <li key={invoice.id}>
              <span>
                Invoice {invoice.id}: ${(invoice.amountDue / 100).toFixed(2)} — {invoice.status}
              </span>{" "}
              {showPayButton && invoice.status === "overdue" && (
                <button type="button" onClick={pay}>
                  {paymentCopy === "alternative" ? "Settle invoice" : "Pay invoice"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
