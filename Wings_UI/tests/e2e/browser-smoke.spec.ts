import { expect, test } from "@playwright/test";

const appPassword = "browser-smoke-password-1";

test("browser smoke covers auth, image studio, workflow templates, tools, and Telegram surfaces", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Wings Of World").first()).toBeVisible();
  await expect(page.getByText("Open").first()).toBeVisible();

  const bootstrap = await page.request.post("/api/auth/bootstrap", {
    data: { password: appPassword },
  });
  expect(bootstrap.ok()).toBe(true);

  await page.reload();
  await expect(page.getByRole("heading", { name: /Unlock Wings Of World/i })).toBeVisible();
  await page.getByPlaceholder("Password").fill(appPassword);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("Protected").first()).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Provider Profile", { exact: true })).toBeVisible();
  await expect(page.getByText("Connection", { exact: true })).toBeVisible();

  await page.goto("/workflow-builder");
  await expect(page.getByRole("heading", { name: "Workflow Builder" })).toBeVisible();
  await page.getByLabel("Workflow template").selectOption("conditional-routing");
  await page.getByRole("button", { name: /Load template/i }).click();
  await expect(page.locator('input[value="Conditional Routing"]')).toBeVisible();
  await expect(page.getByText("Urgent?").first()).toBeVisible();
  await expect(page.getByText("Incident Triage").first()).toBeVisible();
  await expect(page.getByText("Standard Reply").first()).toBeVisible();

  await page.getByLabel("Workflow template").selectOption("loop-line-items");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Load template/i }).click();
  await expect(page.locator('input[value="Loop Over Line Items"]')).toBeVisible();
  await expect(page.getByText("Normalize Items").first()).toBeVisible();
  await expect(page.getByText("Loop Result").first()).toBeVisible();

  await page.goto("/tools");
  await expect(page.getByRole("heading", { name: /Operational Tools/i })).toBeVisible();
  await expect(page.getByText("calculator").first()).toBeVisible();
  await expect(page.getByText("generate_image").first()).toBeVisible();

  await page.goto("/images");
  await expect(page.getByRole("heading", { name: /Image Studio/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate Image/i })).toBeVisible();

  await page.goto("/telegram");
  await expect(page.getByRole("heading", { name: /Telegram/i })).toBeVisible();
  await expect(page.getByText("/tasks").first()).toBeVisible();
});
