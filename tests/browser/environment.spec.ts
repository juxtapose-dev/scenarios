import { expect, test } from "@playwright/test";

test("injected clock and explicit formatting ignore browser timezone and locale", async ({
  browser,
}) => {
  const outputs: string[] = [];
  for (const settings of [
    { locale: "en-US", timezoneId: "America/Los_Angeles" },
    { locale: "de-DE", timezoneId: "Asia/Tokyo" },
  ]) {
    const context = await browser.newContext(settings);
    try {
      const page = await context.newPage();
      await page.goto(
        "http://127.0.0.1:6107/iframe.html?id=environment--fixed-time&viewMode=story",
      );
      await expect(page.locator("time")).toHaveAttribute("datetime", "2026-01-15T12:00:00.000Z");
      await expect(page.locator("time")).toHaveText("15/01/2026, 12:00");
      outputs.push((await page.locator("time").textContent()) ?? "");
    } finally {
      await context.close();
    }
  }
  expect(outputs[0]).toBe(outputs[1]);
});
