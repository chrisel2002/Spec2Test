import { NextResponse } from "next/server";
import { z } from "zod";

import { ReviewError, reviewTestCase } from "@/lib/review/service";
import { ReviewRequestSchema } from "@/lib/review/transitions";

export const dynamic = "force-dynamic";

// Approve, reject, or edit one test case. Body: { actor, change }.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsedId = z.uuid().safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid test case id" }, { status: 400 });
  }

  const body = ReviewRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid review" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await reviewTestCase(parsedId.data, body.data));
  } catch (error) {
    if (error instanceof ReviewError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Review failed", error);
    return NextResponse.json({ error: "Couldn't save the review" }, { status: 500 });
  }
}
