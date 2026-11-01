import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:6108";

test("Svelte Canvas uses fresh deterministic fixtures on revisit", async ({ page }) => {
  await page.goto(`${origin}/?path=/story/fixture-card--first`);
  const preview = page.frameLocator("#storybook-preview-iframe");
  const first = preview.getByRole("article", { name: "First" });
  await expect(first.getByText("Ada Rivera")).toBeVisible();
  const email = await first.locator("p").nth(1).textContent();
  await first.getByRole("button", { name: "Change fixture" }).click();
  await expect(first.getByText("Changed locally")).toBeVisible();
  await page.getByRole("link", { name: "Second", exact: true }).click();
  await expect(
    preview.getByRole("article", { name: "Second" }).getByText("Ada Rivera"),
  ).toBeVisible();
  await page.getByRole("link", { name: "First", exact: true }).click();
  await expect(first.getByText("Ada Rivera")).toBeVisible();
  await expect(first.locator("p").nth(1)).toHaveText(email ?? "");
});

test("Svelte Docs stories keep concurrently loaded fixture objects independent", async ({
  page,
}) => {
  await page.goto(`${origin}/iframe.html?id=fixture-card--docs&viewMode=docs`);
  const first = page.getByRole("article", { name: "First" }).last();
  const second = page.getByRole("article", { name: "Second" });
  await expect(first.getByText("Ada Rivera")).toBeVisible();
  await expect(second.getByText("Ada Rivera")).toBeVisible();
  await first.getByRole("button", { name: "Change fixture" }).click();
  await second.getByRole("button", { name: "Read fixture" }).click();
  await expect(first.getByText("Changed locally")).toBeVisible();
  await expect(second.getByText("Ada Rivera")).toBeVisible();
});

test("Svelte live controls update the Canvas", async ({ page }) => {
  await page.goto(`${origin}/?path=/story/fixture-card--first`);
  const preview = page.frameLocator("#storybook-preview-iframe");
  await expect(preview.getByRole("heading", { name: "First" })).toBeVisible();
  await page.getByRole("tab", { name: /Controls/ }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "label" })
    .getByRole("textbox")
    .fill("Updated label");
  await expect(preview.getByRole("heading", { name: "Updated label" })).toBeVisible();
});
