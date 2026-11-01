import { HttpResponse, http } from "msw/http";
import { setupServer } from "msw/node";
import { afterEach, expect, it, vi } from "vitest";
import { getInvoices } from "../example/generated/client.js";

const server = setupServer(
  http.get("http://example.test/api/invoices", () =>
    HttpResponse.json({ error: "Invoice service unavailable" }, { status: 500 }),
  ),
);
afterEach(() => {
  server.close();
  vi.unstubAllGlobals();
});

it("rejects a documented HTTP 500 through the generated client", async () => {
  server.listen({ onUnhandledFrame: "error" });
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    realFetch(new URL(url, "http://example.test"), init),
  );
  await expect(getInvoices()).rejects.toMatchObject({ status: 500 });
});
