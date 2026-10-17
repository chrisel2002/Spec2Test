import { NextResponse } from "next/server";
import { z } from "zod";

import { ReviewError, resolveRequirement } from "@/lib/review/service";
import { ResolveRequirementSchema } from "@/lib/review/transitions";

export const dynamic = "force-dynamic";

// Resolve an ambiguous requirement with new wording and regenerate its
// tests. Body: { actor, text }. Responds with the whole updated run, since
// the requirement, its tests, the history, and the cost all changed.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsedId = z.uuid().safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid requirement id" }, { status: 400 });
  }

  const body = ResolveRequirementSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid rewrite" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await resolveRequirement(parsedId.data, body.data));
  } catch (error) {
    if (error instanceof ReviewError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Resolving requirement failed", error);
    return NextResponse.json(
      { error: "Couldn't regenerate the tests. Try again in a moment." },
      { status: 502 },
    );
  }
}
