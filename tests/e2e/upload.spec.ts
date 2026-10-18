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

test("rejects an empty file and a renamed non-PDF with a clear message", async ({ page }) => {
  await page.goto("/");

  await page.setInputFiles('input[type="file"]', {
    name: "empty-spec.md",
    mimeType: "text/markdown",
    buffer: Buffer.alloc(0),
  });
  await expect(page.getByText("The file is empty.")).toBeVisible({ timeout: 15000 });

  // A PNG renamed to .pdf: the first bytes give it away.
  await page.setInputFiles('input[type="file"]', {
    name: "requirements.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await expect(page.getByText("This file is named .pdf but isn't a PDF.")).toBeVisible({
    timeout: 15000,
  });

  // Neither file was stored.
  await expect(page.locator("aside li", { hasText: "empty-spec.md" })).toHaveCount(0);
  await expect(page.locator("aside li", { hasText: "requirements.pdf" })).toHaveCount(0);
});
