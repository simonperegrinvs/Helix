import { expect, test } from "@playwright/test";

test("projects page loads", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByText("Research Projects")).toBeVisible();
});
