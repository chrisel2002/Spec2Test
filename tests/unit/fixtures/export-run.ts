import type {
  RequirementView,
  RunDetail,
  TestCaseView,
} from "@/lib/runs/types";

// A small completed run shared by the exporter tests, with the awkward
// inputs exporters must survive: commas, quotes, a "€", multi-line steps,
// a resolved ambiguity, an unresolved one, and a cell starting with "=".

function requirement(overrides: Partial<RequirementView> & { id: string; code: string }): RequirementView {
  return {
    title: "Untitled",
    text: "The system shall do something.",
    isAmbiguous: false,
    ambiguityReason: null,
    suggestedRewrite: null,
    ambiguityResolved: false,
    originalText: null,
    ...overrides,
  };
}

function testCase(overrides: Partial<TestCaseView> & { id: string; requirementId: string }): TestCaseView {
  return {
    title: "A test",
    type: "positive",
    given: "a precondition",
    when: "an action",
    then: "an outcome",
    status: "draft",
    basedOnAssumption: false,
    updatedAt: "2026-10-18T09:00:00.000Z",
    ...overrides,
  };
}

export function exportRun(overrides: Partial<RunDetail["run"]> = {}): RunDetail {
  return {
    run: {
      id: "11111111-2222-4333-8444-555555555555",
      documentId: "doc-1",
      status: "completed",
      error: null,
      rateLimited: false,
      coverage: { covered: 1, total: 2 },
      createdAt: "2026-10-18T09:00:00.000Z",
      finishedAt: "2026-10-18T09:05:00.000Z",
      ...overrides,
    },
    steps: [],
    requirements: [
      requirement({
        id: "r1",
        code: "REQ-01",
        title: "Order total, with VAT",
        text: 'The cart shall show the total in € with a "VAT included" note.',
      }),
      requirement({
        id: "r2",
        code: "REQ-02",
        title: "Fast checkout",
        text: "Checkout shall complete within 2 seconds for 95% of orders.",
        isAmbiguous: true,
        ambiguityReason: 'Uses "fast" without a threshold.',
        suggestedRewrite: "Checkout shall complete within 2 seconds for 95% of orders.",
        ambiguityResolved: true,
        originalText: "Checkout should be fast.",
      }),
      requirement({
        id: "r3",
        code: "REQ-03",
        title: "Pleasant design",
        text: "The page should look pleasant.",
        isAmbiguous: true,
        ambiguityReason: 'Uses "pleasant", which is subjective.',
        suggestedRewrite: "The page shall pass the brand style checklist.",
      }),
    ],
    testCases: [
      testCase({
        id: "t1",
        requirementId: "r1",
        title: "Shows the total in €",
        status: "approved",
        given: "a cart with 2 items at €9.99",
        when: "the user opens the cart",
        then: 'the total reads "€19.98"\nand a "VAT included" note is shown',
      }),
      testCase({
        id: "t2",
        requirementId: "r1",
        title: "=SUM(A1) is shown as text",
        type: "negative",
        status: "rejected",
      }),
      testCase({ id: "t3", requirementId: "r2", title: "Checkout under 2 s", status: "draft" }),
      testCase({ id: "t4", requirementId: "r3", title: "Looks nice", status: "approved" }),
    ],
    reviewEvents: [],
  };
}
