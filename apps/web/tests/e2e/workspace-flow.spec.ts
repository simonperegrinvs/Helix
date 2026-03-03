import { expect, test } from "@playwright/test";

test("end-to-end workspace flow", async ({ page }) => {
  const projectName = `E2E Project ${Date.now()}`;

  await page.goto("/projects");
  await expect(page.getByText("Research Projects")).toBeVisible();

  await page.getByPlaceholder("Project name").fill(projectName);
  await page.getByRole("button", { name: "Create" }).click();

  const projectCard = page.locator(".card", { hasText: projectName }).first();
  await expect(projectCard).toBeVisible();
  await projectCard.getByRole("link", { name: "Open Workspace" }).click();

  await page.getByRole("link", { name: "Reports" }).click();
  await page.getByRole("button", { name: "Import Report" }).click();
  await expect(page.getByText("reportId").first()).toBeVisible();

  await page.getByRole("link", { name: "Chat" }).click();
  await page
    .getByPlaceholder("Ask a question grounded in this project...")
    .fill("What evidence do we have so far?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.locator(".chat-stream")).not.toContainText("No streamed response yet.");

  await page.getByRole("link", { name: "External Query" }).click();
  await page.getByRole("button", { name: "Draft Query Package" }).click();
  await expect(page.getByText("Status: draft").first()).toBeVisible();

  await page.getByRole("link", { name: "Audit" }).click();
  await expect(page.getByText("workspace.create_project").first()).toBeVisible();
});
