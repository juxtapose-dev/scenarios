import { createMswSession } from "@juxtapose/scenarios/msw";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

const handlers = [http.get("/api/person", () => HttpResponse.json({ name: "Ada" }))];
const host = setupServer(...handlers);
export const session = createMswSession(host, {
  baselineHandlers: handlers,
  apiPrefixes: ["/api"],
});
