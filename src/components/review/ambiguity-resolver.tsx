"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ResolveRequirementSchema } from "@/lib/review/transitions";
import type { RequirementView } from "@/lib/runs/types";

// Lets the reviewer settle an ambiguous requirement: accept the suggested
// rewrite as-is, or write their own wording. Either way the requirement's
// tests are thrown away and regenerated from the new text.
export function AmbiguityResolver({
  requirement,
  actor,
  reviewable,
  onResolve,
}: {
  requirement: RequirementView;
  actor: string;
  reviewable: boolean;
  // Resolves with an error message, or null on success.
  onResolve: (requirementId: string, text: string) => Promise<string | null>;
}) {
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState(requirement.suggestedRewrite ?? requirement.text);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!reviewable) return null;

  async function resolve(text: string) {
    const parsed = ResolveRequirementSchema.safeParse({ actor, text });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid rewrite");
      return;
    }
    setPending(true);
    setError(null);
    const failure = await onResolve(requirement.id, parsed.data.text);
    setPending(false);
    setError(failure);
  }

  if (pending) {
    return (
      <p className="flex items-center gap-2 pt-1 text-sm text-amber-800 dark:text-amber-300" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Regenerating tests for {requirement.code}…
      </p>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      {writing ? (
        <>
          <label htmlFor={`rewrite-${requirement.id}`} className="text-xs font-medium">
            Your rewrite
          </label>
          <Textarea
            id={`rewrite-${requirement.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="bg-background"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => resolve(draft)}>
              <Sparkles aria-hidden />
              Save and regenerate tests
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setWriting(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => resolve(requirement.suggestedRewrite ?? "")}>
            <Sparkles aria-hidden />
            Accept rewrite and regenerate tests
          </Button>
          <Button size="sm" variant="outline" className="bg-background" onClick={() => setWriting(true)}>
            Write my own
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
