import { expect, type Locator, type Page, test } from "@playwright/test";

// The full human-in-the-loop flow, with the model mocked (MODEL_PROVIDER=
// mock, see playwright.config.ts): upload a spec, run the agent until it
// pauses for review, approve one test, edit another, build the matrix, and
// check the matrix reflects exactly those decisions.
//
// With the mock, sample-specs/checkout.md yields 10 requirements, 3 of
// them ambiguous (REQ-06 "fast", REQ-08 "reasonable", REQ-10 "intuitive"),
// and 2 tests per requirement: a positive one first, then a negative one.

function requirementCard(page: Page, code: string): Locator {
  return page.locator(`[data-testid="requirement-card"][data-code="${code}"]`);
}

async function expand(card: Locator) {
  await card.locator("button[aria-expanded]").click();
  await expect(card.getByTestId("test-case").first()).toBeVisible();
}

test("reviews generated tests and builds the traceability matrix", async ({ page }) => {
  // The first test in a fresh dev server also pays for compiling the pages.
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByLabel("Reviewing as").fill("E2E Reviewer");

  await page.setInputFiles("#spec-upload", "sample-specs/checkout.md");
  await expect(page.getByRole("heading", { name: "checkout.md" })).toBeVisible({
    timeout: 30_000,
  });

  // Run the agent; it streams progress and then pauses for review. ("New
  // run" if an earlier test run already ran it on this document.)
  await page
    .getByRole("button", { name: /^(Run agent|New run)$/ })
    .first()
    .click();
  await expect(page.getByTestId("run-status")).toHaveAttribute(
    "data-status",
    "waiting_for_review",
    { timeout: 60_000 },
  );
  await expect(page.getByTestId("requirement-card")).toHaveCount(10);
  await expect(page.getByTestId("step-build_matrix")).toHaveAttribute("data-state", "review");

  // Approve the first test of REQ-01.
  const req1 = requirementCard(page, "REQ-01");
  await expand(req1);
  const approved = req1.getByTestId("test-case").first();
  await approved.getByRole("button", { name: /^Approve/ }).click();
  await expect(approved).toHaveAttribute("data-status", "approved");
  await expect(approved.getByText("Approved by E2E Reviewer")).toBeVisible();

  // Edit the second test of REQ-02; saving an edit approves it.
  const req2 = requirementCard(page, "REQ-02");
  await expand(req2);
  const edited = req2.getByTestId("test-case").nth(1);
  await edited.getByRole("button", { name: /^Edit/ }).click();
  await edited.getByLabel("Title").fill("Cart is empty for a brand-new session");
  // The form validates with the shared Zod schema before anything is sent.
  await edited.getByLabel("Then").fill("");
  await edited.getByRole("button", { name: "Save and approve" }).click();
  await expect(edited.getByText("Describe the expected outcome")).toBeVisible();
  await edited.getByLabel("Then").fill("the cart shows no items");
  await edited.getByRole("button", { name: "Save and approve" }).click();
  await expect(edited).toHaveAttribute("data-status", "approved");
  await expect(edited.getByText("the cart shows no items")).toBeVisible();

  // 2 of 7 testable requirements (10 minus 3 ambiguous) now have an approved test.
  await expect(page.getByTestId("coverage-percent")).toHaveText("29%");

  // Resume the paused graph.
  await page.getByRole("button", { name: "Build matrix" }).click();
  await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", "completed", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("step-build_matrix")).toHaveAttribute("data-state", "done");

  // The matrix shows exactly the statuses we set.
  await page.getByRole("tab", { name: "Traceability matrix" }).click();
  const row = (code: string) =>
    page.locator(`[data-testid="matrix-row"][data-code="${code}"]`);

  await expect(row("REQ-01")).toHaveAttribute("data-gap", "none");
  await expect(row("REQ-01").locator('[data-testid="matrix-test"][data-status="approved"]')).toHaveCount(1);
  await expect(row("REQ-01").locator('[data-testid="matrix-test"][data-status="draft"]')).toHaveCount(1);

  await expect(row("REQ-02")).toHaveAttribute("data-gap", "none");
  await expect(
    row("REQ-02").locator('[data-testid="matrix-test"][data-status="approved"]'),
  ).toHaveText(/Cart is empty for a brand-new session/);

  await expect(row("REQ-03")).toHaveAttribute("data-gap", "no_approved_tests");
  await expect(row("REQ-06")).toHaveAttribute("data-gap", "unresolved_ambiguity");

  // Filters: only the two approved tests' rows, then only the gaps.
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await expect(page.getByTestId("matrix-row")).toHaveCount(2);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Gaps only").check();
  await expect(page.getByTestId("matrix-row")).toHaveCount(8);
  await expect(row("REQ-01")).toHaveCount(0);
});
