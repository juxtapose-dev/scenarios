import { defineConfig } from "orval";

export default defineConfig({
  billing: {
    input: "./example/openapi.json",
    output: {
      target: "./example/generated/client.ts",
      schemas: "./example/generated/models",
      client: "fetch",
      clean: true,
      override: {
        enumGenerationType: "union",
        fetch: { includeHttpResponseReturnType: false, forceSuccessResponse: true },
      },
    },
  },
});
