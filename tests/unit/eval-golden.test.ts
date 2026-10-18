import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GoldenSpecSchema } from "../../evals/golden/schema";
import { matchesTerms, matchRequirements, mentionsTerm } from "../../evals/lib/matching";

// Checks the golden files themselves, so a typo in one can't quietly turn
// into a misleading eval score.

const SPECS = ["login-account-spec", "checkout-spec", "injection-spec"] as const;

function loadGolden(name: string) {
  return GoldenSpecSchema.parse(
    JSON.parse(readFileSync(join(process.cwd(), "evals/golden", `${name}.json`), "utf8")),
  );
}

// The spec's own text, split into its REQ-xx-NN sections.
function specSections(dir: string, file: string): Map<string, string> {
  const text = readFileSync(join(process.cwd(), dir, file), "utf8");
  const sections = new Map<string, string>();
  for (const part of text.split(/^### /m).slice(1)) {
    const id = /^(REQ-[A-Z]+-\d+):/.exec(part)?.[1];
    if (id) sections.set(id, part.replace(/\s+/g, " "));
  }
  return sections;
}

describe("mentionsTerm", () => {
  it("matches at the start of a word, case-insensitively", () => {
    expect(mentionsTerm("Account LOCKOUT after five tries", "lockout")).toBe(true);
    expect(mentionsTerm("the account is locked", "lock")).toBe(true);
    expect(mentionsTerm("unlock the account", "lock")).toBe(false);
    expect(mentionsTerm("an invalid password", "valid")).toBe(false);
  });

  it("treats numbers and symbols sensibly", () => {
    expect(mentionsTerm("after 5 attempts", "5")).toBe(true);
    expect(mentionsTerm("for 15 minutes", "5")).toBe(false);
    expect(mentionsTerm("orders of €50.00 or more", "50")).toBe(true);
  });
});

describe("matchRequirements", () => {
  it("assigns each golden requirement at most one extracted one", () => {
    const golden = [{ id: "A", matchTerms: [["lock"]] }];
    expect(matchRequirements(["lock it", "lock it again"], golden)).toEqual(new Map([[0, "A"]]));
  });

  it("moves an earlier match when that lets more requirements match", () => {
    // "reset link expires" fits both; greedy would give it to RESET and
    // leave EXPIRY unmatched.
    const golden = [
      { id: "RESET", matchTerms: [["reset"], ["link"]] },
      { id: "EXPIRY", matchTerms: [["link"], ["expire"]] },
    ];
    const matches = matchRequirements(["reset link expires", "send a reset link"], golden);
    expect(matches).toEqual(
      new Map([
        [0, "EXPIRY"],
        [1, "RESET"],
      ]),
    );
  });
});

describe.each(SPECS)("golden file %s", (name) => {
  const golden = loadGolden(name);
  const sections = specSections(golden.specDir, golden.spec);

  it("covers every requirement section in the spec, and nothing else", () => {
    expect([...new Set(golden.requirements.map((r) => r.sourceId))]).toEqual([...sections.keys()]);
  });

  it("has matchTerms that the spec's own wording satisfies", () => {
    for (const requirement of golden.requirements) {
      expect(
        matchesTerms(sections.get(requirement.sourceId) ?? "", requirement.matchTerms),
        requirement.id,
      ).toBe(true);
    }
  });

  it("scores a perfect extraction (its own statements) as a perfect match", () => {
    const matches = matchRequirements(
      golden.requirements.map((r) => r.statement),
      golden.requirements,
    );
    golden.requirements.forEach((requirement, i) => {
      expect(matches.get(i), requirement.statement).toBe(requirement.id);
    });
  });

  it("has boundary patterns that match their examples and not their counter-examples", () => {
    for (const boundary of golden.boundaries) {
      const patterns = boundary.patterns.map((p) => new RegExp(p, "i"));
      for (const example of boundary.examples) {
        expect(patterns.some((p) => p.test(example)), `${boundary.id}: ${example}`).toBe(true);
      }
      for (const counter of boundary.counterExamples) {
        expect(patterns.some((p) => p.test(counter)), `${boundary.id}: ${counter}`).toBe(false);
      }
    }
  });
});

describe("golden content", () => {
  const login = loadGolden("login-account-spec");
  const checkout = loadGolden("checkout-spec");
  const ambiguous = [...login.requirements, ...checkout.requirements]
    .filter((r) => r.ambiguous)
    .map((r) => r.id);

  it("flags exactly the agreed ambiguous requirements", () => {
    expect(ambiguous).toEqual([
      "REQ-LA-09",
      "REQ-LA-15",
      "REQ-LA-17",
      "REQ-CO-07",
      "REQ-CO-11",
      "REQ-CO-15",
    ]);
  });

  it("splits the two compound requirements in two", () => {
    const parts = (sourceId: string) =>
      [...login.requirements, ...checkout.requirements]
        .filter((r) => r.sourceId === sourceId)
        .map((r) => r.id);
    expect(parts("REQ-LA-11")).toEqual(["REQ-LA-11.1", "REQ-LA-11.2"]);
    expect(parts("REQ-CO-06")).toEqual(["REQ-CO-06.1", "REQ-CO-06.2"]);
  });

  it("lists the agreed boundary values", () => {
    expect([...login.boundaries, ...checkout.boundaries].map((b) => b.value)).toEqual([
      "5 failed logins",
      "12-character passwords",
      "24-hour link expiry",
      "quantity 1–10",
      "€50.00 delivery threshold",
    ]);
  });
});
