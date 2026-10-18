import { expect, test } from "@playwright/test";

test("uploading a spec shows it in the document list", async ({ page }) => {
  await page.goto("/");

  await page.setInputFiles(
    'input[type="file"]',
    "sample-specs/login-account-spec.md",
  );

  const documentRow = page.locator("aside li", {
    hasText: "login-account-spec.md",
  });
  await expect(documentRow).toBeVisible({ timeout: 15000 });
  await expect(documentRow.getByText(/\d+ chunks/)).toBeVisible();
});
