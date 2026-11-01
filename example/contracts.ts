import type { Customer, GetInvoices500, Invoice } from "./generated/models/index.js";

// Project-owned runtime validation. Types from Orval alone do not inspect JSON.
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function isCustomer(value: unknown): value is Customer {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string"
  );
}
export function isInvoice(value: unknown): value is Invoice {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.customerId === "string" &&
    typeof value.amountDue === "number" &&
    Number.isInteger(value.amountDue) &&
    (value.status === "overdue" || value.status === "paid")
  );
}
export function isInvoices(value: unknown): value is Invoice[] {
  return Array.isArray(value) && Array.from(value).every((entry: unknown) => isInvoice(entry));
}

/** The validator's narrowed return type remains inferred; no schema package required. */
export function validateResponse<T>(
  name: string,
  value: unknown,
  valid: (value: unknown) => value is T,
): T {
  if (!valid(value)) throw new Error(`Mock response violates ${name} contract`);
  return value;
}

export function isInvoiceError(value: unknown): value is GetInvoices500 {
  return record(value) && typeof value.error === "string";
}
