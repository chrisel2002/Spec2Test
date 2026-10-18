import { NextResponse } from "next/server";
import { z } from "zod";

import { ACCESS_COOKIE, accessCode, accessToken, codeMatches } from "@/lib/access";
import { rateLimit } from "@/lib/services/rate-limits";

export const dynamic = "force-dynamic";

const AccessRequestSchema = z.object({ code: z.string().trim().min(1).max(200) });

// Exchanges the demo access code for a cookie (see lib/access.ts).
export async function POST(request: Request) {
  const limited = rateLimit(request, "access");
  if (limited) return limited;

  const code = accessCode();
  if (!code) return NextResponse.json({ ok: true });

  const body = AccessRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !codeMatches(body.data.code, code)) {
    return NextResponse.json({ error: "That access code isn't right." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, accessToken(code), {
    // Never readable from page scripts, so an XSS bug couldn't steal it.
    httpOnly: true,
    // Sent on same-site requests and top-level navigations only, so
    // another site can't make a visitor's browser spend the quota (CSRF).
    sameSite: "lax",
    // HTTPS only in production; local http://localhost still works.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
