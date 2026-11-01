import { createMswSession, startMswWorker } from "@juxtapose/scenarios/msw";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

const handlers = [http.get("/api/person", () => HttpResponse.json({ name: "Ada" }))];
const host = setupServer(...handlers);
export const session = createMswSession(host, {
  baselineHandlers: handlers,
  apiPrefixes: ["/api"],
});

export async function browserSession(worker: Parameters<typeof startMswWorker>[0]) {
  return startMswWorker(
    worker,
    { baselineHandlers: [], apiPrefixes: ["/api"] },
    {
      quiet: true,
      serviceWorker: { url: "/mockServiceWorker.js" },
    },
  );
}
