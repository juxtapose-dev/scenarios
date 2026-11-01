import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:6107",
    locale: "en-US",
    timezoneId: "UTC",
    viewport: { width: 1200, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node scripts/serve.mjs",
      url: "http://127.0.0.1:6107",
      reuseExistingServer: false,
    },
    {
      command: "node scripts/serve.mjs storybook-svelte-static 6108",
      url: "http://127.0.0.1:6108",
      reuseExistingServer: false,
    },
  ],
});
