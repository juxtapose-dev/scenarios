import { HttpResponse, http } from "msw/http";
import { setupServer } from "msw/node";
import { expect, it, vi } from "vitest";
import {
  isCustomer,
  isInvoice,
  isInvoiceError,
  isInvoices,
  validateResponse,
} from "../example/contracts.js";
import { fixedClock } from "../example/Environment.js";
import { getInvoices } from "../example/generated/client.js";

it("validates unknown runtime payloads rather than trusting generated TypeScript types", () => {
  expect(isCustomer({ id: "c", name: "Ada", email: "ada@example.test" })).toBe(true);
  expect(isCustomer({ id: "c" })).toBe(false);
  expect(isInvoiceError({ error: "Expected failure" })).toBe(true);
  expect(isInvoiceError({ error: 500 })).toBe(false);
  expect(isInvoices(Array(1))).toBe(false);
  expect(isInvoice({ id: "i", customerId: "c", amountDue: 1.5, status: "paid" })).toBe(false);
  expect(isInvoice({ id: "i", customerId: "c", amountDue: 10, status: "paid" })).toBe(true);
  expect(isInvoice({ id: "i", customerId: "c", amountDue: Number.NaN, status: "paid" })).toBe(
    false,
  );
  expect(() => validateResponse("Invoice[]", [{ status: "unknown" }], isInvoices)).toThrow(
    "Invoice[] contract",
  );
});

it("rejects an incompatible mock through MSW and the real generated client", async () => {
  const server = setupServer(
    http.get("http://example.test/api/invoices", () => {
      const payload: unknown = [{ id: "i", status: "unknown" }];
      return HttpResponse.json(validateResponse("Invoice[]", payload, isInvoices));
    }),
  );
  server.listen({ onUnhandledFrame: "error" });
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    realFetch(new URL(url, "http://example.test"), init),
  );
  try {
    await expect(getInvoices()).rejects.toMatchObject({ status: 500 });
  } finally {
    server.close();
    vi.unstubAllGlobals();
  }
});

it("returns fresh fixed-clock dates without patching the application's Date", () => {
  const clock = fixedClock("2026-01-15T12:00:00.000Z");
  clock.now().setUTCFullYear(2000);
  expect(clock.now().toISOString()).toBe("2026-01-15T12:00:00.000Z");
  expect(() => fixedClock("invalid")).toThrow("Invalid");
});
