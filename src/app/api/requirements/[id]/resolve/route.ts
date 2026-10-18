import { NextResponse } from "next/server";

import { ResolveRequirementSchema } from "@/lib/review/transitions";
import { respond } from "@/lib/services/http";
import { resolveRequirement } from "@/lib/services/review";
import { rateLimit } from "@/lib/services/rate-limits";

export const dynamic = "force-dynamic";

// Resolve an ambiguous requirement with new wording and regenerate its
// tests. Body: { actor, text }. Responds with the whole updated run, since
// the requirement, its tests, the history, and the cost all changed.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "model");
  if (limited) return limited;
  const body = ResolveRequirementSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid rewrite" },
      { status: 400 },
    );
  }

  const { id } = await params;
  return respond(() => resolveRequirement(id, body.data), {
    fallbackError: "Couldn't regenerate the tests. Try again in a moment.",
  });
}
