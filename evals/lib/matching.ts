// Deterministic matching between extracted requirements and golden ones.
// No embeddings and no LLM judge: a requirement matches when it mentions
// every one of the golden requirement's term groups, so the same output
// always scores the same and anyone can see why something did or didn't
// match.

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive, anchored at the start of a word (any letter or digit
// counts as a word character, so "€50" and "2fa" work too): "lock" matches
// "lockout" and "locked" but not "unlock"; "5" matches "5 attempts" but
// not "15".
export function mentionsTerm(text: string, term: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(term)}`, "iu").test(text);
}

export function matchesTerms(text: string, groups: string[][]): boolean {
  return groups.every((alternatives) => alternatives.some((term) => mentionsTerm(text, term)));
}

export type MatchCandidate = { id: string; matchTerms: string[][] };

// One-to-one assignment of extracted requirements to golden ones, as a
// maximum bipartite matching (Kuhn's augmenting-path algorithm): first
// find every (extracted, golden) pair whose terms match, then pick pairs so
// that as many golden requirements as possible are matched, each by a
// different extracted one.
//
// Why not "first match wins": term sets overlap on purpose. "The password
// reset link shall expire after 24 hours" mentions everything the reset-
// link requirement asks for, too. Greedy assignment could give it to the
// wrong golden requirement and leave the real one unmatched; the augmenting
// step moves it to the right one whenever that matches more pairs overall.
// Iteration order is fixed, so the result is deterministic.
export function matchRequirements(
  extracted: string[],
  golden: MatchCandidate[],
): Map<number, string> {
  const candidates = extracted.map((text) =>
    golden.flatMap((g, j) => (matchesTerms(text, g.matchTerms) ? [j] : [])),
  );
  const goldenOwner = new Array<number>(golden.length).fill(-1);

  function assign(i: number, visited: boolean[]): boolean {
    for (const j of candidates[i]) {
      if (visited[j]) continue;
      visited[j] = true;
      if (goldenOwner[j] === -1 || assign(goldenOwner[j], visited)) {
        goldenOwner[j] = i;
        return true;
      }
    }
    return false;
  }

  extracted.forEach((_, i) => assign(i, new Array<boolean>(golden.length).fill(false)));

  const result = new Map<number, string>();
  goldenOwner.forEach((i, j) => {
    if (i !== -1) result.set(i, golden[j].id);
  });
  return result;
}
