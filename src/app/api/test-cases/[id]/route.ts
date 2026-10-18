import { NextResponse } from "next/server";

import { ReviewRequestSchema } from "@/lib/review/transitions";
import { requireAccess } from "@/lib/services/access";
import { respond } from "@/lib/services/http";
import { reviewTestCase } from "@/lib/services/review";

export const dynamic = "force-dynamic";

// Approve, reject, or edit one test case. Body: { actor, change }.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const body = ReviewRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid review" },
      { status: 400 },
    );
  }

  const { id } = await params;
  return respond(() => reviewTestCase(id, body.data), {
    fallbackError: "Couldn't save the review",
  });
}
