import { expect, test } from "@playwright/test";

test("React fixture-only Canvas resets on a fresh load", async ({ page }) => {
  await page.goto("/iframe.html?id=fixtures-react--standard&viewMode=story");
  await page.getByRole("button", { name: "Rename locally" }).click();
  await expect(page.getByRole("heading", { name: "Changed locally" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Alex Morgan" })).toBeVisible();
});

test("React inline Docs keeps identical stories' fixtures independent", async ({ page }) => {
  await page.goto("/iframe.html?id=fixtures-react--docs&viewMode=docs");
  await expect(page.getByRole("heading", { name: "Alex Morgan", exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Rename locally" }).first().click();
  await expect(page.getByRole("heading", { name: "Changed locally" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Alex Morgan", exact: true })).toHaveCount(2);
});

test("React fixture variants follow Controls without rerunning the loader", async ({ page }) => {
  await page.goto("/?path=/story/fixtures-react--standard");
  const preview = page.frameLocator("#storybook-preview-iframe");
  await expect(preview.getByRole("heading", { name: "Alex Morgan" })).toBeVisible();
  await page.getByRole("tab", { name: /Controls/ }).click();
  await page.getByLabel("variant", { exact: true }).selectOption("enterprise");
  await expect(preview.getByRole("heading", { name: "Enterprise customer" })).toBeVisible();
});
