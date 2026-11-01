import { expect, type Page, test } from "@playwright/test";
import type {} from "../../src/storybook.js";

async function openStory(page: Page, story: string) {
  await page.goto(`/iframe.html?id=billing--${story}&viewMode=story`);
}

async function expectReady(page: Page, checkpoint: string) {
  await expect
    .poll(() => page.evaluate(() => window.__REHEARSAL__?.getActive()?.execution.status))
    .toBe("ready");
  const active = await page.evaluate(() => window.__REHEARSAL__?.getActive());
  expect(active?.execution.diagnostics).toEqual([]);
  expect(active?.execution.checkpoints).toContainEqual(
    expect.objectContaining({ name: checkpoint, status: "ready" }),
  );
  return active;
}

test("generated client loads repeatable data in independent browser pages", async ({
  page,
  context,
}) => {
  await openStory(page, "success");
  const first = await expectReady(page, "loaded");
  const content = await page.locator("#storybook-root").textContent();
  const secondPage = await context.newPage();
  await openStory(secondPage, "success");
  const second = await expectReady(secondPage, "loaded");
  expect(await secondPage.locator("#storybook-root").textContent()).toEqual(content);
  expect(second?.execution.descriptor).toEqual(first?.execution.descriptor);
  expect(second?.execution.executionId).not.toEqual(first?.execution.executionId);
  expect(JSON.stringify(first)).not.toContain("@example");
  await secondPage.close();
});

test("expected errors and empty data are legitimate ready scenarios", async ({ page }) => {
  await openStory(page, "expected-error");
  await expect(page.getByRole("alert")).toHaveText("Unable to load invoices.");
  await expectReady(page, "loaded");
  await openStory(page, "empty");
  await expect(page.getByText("No invoices yet.")).toBeVisible();
  await expectReady(page, "loaded");
});

test("payment updates survive a repeated generated-client read", async ({ page }) => {
  await openStory(page, "paid");
  await expectReady(page, "paid");
  await expect(page.getByText(/— paid/)).toBeVisible();
});

test("unhandled API traffic cannot produce a green checkpoint", async ({ page }) => {
  await openStory(page, "unexpected-request");
  await expect
    .poll(() => page.evaluate(() => window.__REHEARSAL__?.getActive()?.execution.status))
    .toBe("failed");
  const active = await page.evaluate(() => window.__REHEARSAL__?.getActive());
  expect(active?.execution.diagnostics).toContainEqual(
    expect.objectContaining({ code: "unhandled-api-request" }),
  );
  expect(
    active?.execution.checkpoints.some(
      (checkpoint) => checkpoint.name === "play-complete" && checkpoint.status === "ready",
    ),
  ).not.toBe(true);
});

test("warm Storybook navigation disposes a held response and resets fixtures", async ({ page }) => {
  await page.goto("/?path=/story/billing--success");
  const preview = page.frameLocator("#storybook-preview-iframe");
  await expect(preview.getByText("invoice-101", { exact: false })).toBeVisible();
  const snapshot = () => preview.locator("body").evaluate(() => window.__REHEARSAL__?.getActive());
  await expect.poll(async () => (await snapshot())?.execution.status).toBe("ready");
  const originalExecution = (await snapshot())?.execution.executionId;
  expect(originalExecution).toBeTruthy();
  const before = await preview.locator("#storybook-root").textContent();
  await page.getByRole("link", { name: "Loading", exact: true }).click();
  await expect(preview.getByText("Loading invoices…")).toBeVisible();
  await expect.poll(async () => (await snapshot())?.storyId).toBe("billing--loading");
  await page.getByRole("link", { name: "Empty", exact: true }).click();
  await expect(preview.getByText("No invoices yet.")).toBeVisible();
  await expect.poll(async () => (await snapshot())?.storyId).toBe("billing--empty");
  await page.getByRole("link", { name: "Success", exact: true }).click();
  await expect(preview.getByText("invoice-101", { exact: false })).toBeVisible();
  await expect.poll(async () => (await snapshot())?.execution.status).toBe("ready");
  const restored = await snapshot();
  expect(restored?.storyId).toBe("billing--success");
  expect(restored?.execution.executionId).not.toBe(originalExecution);
  expect(restored?.execution.diagnostics).toEqual([]);
  expect(restored?.execution.checkpoints).toContainEqual(
    expect.objectContaining({ name: "play-complete", status: "ready" }),
  );
  expect(await preview.locator("#storybook-root").textContent()).toEqual(before);
});
