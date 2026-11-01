import { expect, test } from "@playwright/test";
import type {} from "../../src/storybook.js";

const origin = "http://127.0.0.1:6108";

test("Svelte controls preserve execution and mutations; reload creates a fresh run", async ({
  page,
}) => {
  await page.goto(`${origin}/?path=/story/svelte-lifecycle--stable`);
  const preview = page.frameLocator("#storybook-preview-iframe");
  const snapshot = () =>
    preview.locator("body").evaluate(() => window.__JUXTAPOSE_SCENARIOS__?.getActive());
  await expect.poll(async () => (await snapshot())?.execution.status).toBe("ready");
  const first = await snapshot();
  expect(first?.execution.executionId).toBeTruthy();
  await preview.getByRole("button", { name: "Change state" }).click();
  await expect(preview.getByText("Fixture values: 2")).toBeVisible();
  await expect(preview.getByText("Local changes: 1")).toBeVisible();
  await page.getByRole("tab", { name: /Controls/ }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "label" })
    .getByRole("textbox")
    .fill("Changed label");
  await expect(preview.getByRole("heading", { name: "Changed label" })).toBeVisible();
  await expect(preview.getByText("Fixture values: 2")).toBeVisible();
  await expect(preview.getByText("Local changes: 1")).toBeVisible();
  await expect.poll(async () => (await snapshot())?.execution.status).toBe("ready");
  expect((await snapshot())?.execution.executionId).toBe(first?.execution.executionId);
  await page.getByRole("button", { name: "Reload story" }).click();
  await expect
    .poll(async () => (await snapshot())?.execution.executionId)
    .not.toBe(first?.execution.executionId);
  await expect.poll(async () => (await snapshot())?.execution.status).toBe("ready");
  await expect(preview.getByText("Fixture values: 1")).toBeVisible();
  await expect(preview.getByText("Local changes: 0")).toBeVisible();
});

test("Svelte remount recovers from an initial setup failure", async ({ page }) => {
  await page.goto(`${origin}/?path=/story/svelte-lifecycle--recovery`);
  const preview = page.frameLocator("#storybook-preview-iframe");
  const snapshot = () =>
    preview.locator("body").evaluate(() => window.__JUXTAPOSE_SCENARIOS__?.getActive());
  await expect.poll(async () => (await snapshot())?.execution.status).toBe("failed");
  const failed = await snapshot();
  expect(failed?.execution.diagnostics).toContainEqual(
    expect.objectContaining({ code: "storybook-setup-failed" }),
  );
  await page.getByRole("button", { name: "Reload story" }).click();
  await expect.poll(async () => (await snapshot())?.execution.status).toBe("ready");
  expect((await snapshot())?.execution.executionId).not.toBe(failed?.execution.executionId);
  await expect(preview.getByRole("heading", { name: "Recovery" })).toBeVisible();
});
