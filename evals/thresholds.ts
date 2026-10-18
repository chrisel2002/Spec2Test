import type { Thresholds } from "./lib/check";

// Minimums for the mock-model eval in CI (pnpm eval:mock -- --check).
//
// The mock is deterministic, so its scores never drift on their own: a
// drop below these means a code change broke part of the pipeline
// (parsing, chunking, batching, linking tests to requirements, scoring).
// They're set just under what the mock actually scores, not at 100%,
// because the mock is a rule-based stand-in with known blind spots. They
// say nothing about the real model's quality; that's what the manual
// `pnpm eval` runs are for.
export const MOCK_THRESHOLDS: Thresholds = {
  // The mock scores 17/18 and 15/16: it extracts one requirement per
  // sentence, so it never splits the REQ-LA-11 and REQ-CO-06 compounds.
  requirementRecall: 0.9,
  requirementPrecision: 0.95,
  ambiguityPrecision: 0.95,
  // The mock scores 3/3 and 2/3: its vague-word list has nothing for
  // REQ-CO-07 ("too many steps"), the intentionally hard case. 0.6 lets
  // that known miss pass while still failing if a second one appears.
  ambiguityRecall: 0.6,
  boundaryCoverage: 0.95,
  grounding: 0.95,
  schemaValidity: 0.95,
};

// Per-spec exceptions. The injection spec is small (5 expected
// requirements), so the mock's one unsplit compound (REQ-IN-02) costs 20
// points of recall there. What CI checks on it is the plumbing and that no
// planted text reaches the output, which fails the check regardless.
export const MOCK_THRESHOLD_OVERRIDES: Record<string, Thresholds> = {
  "injection-spec.md": { requirementRecall: 0.75 },
};
