import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  accessCode,
  accessDeniedMessage,
  hasAccess,
  readCookie,
} from "@/lib/access";

// Call at the top of a gated route, before the rate limit. Returns a 401
// to send back, or null if the request may go ahead. `accessRequired: true`
// lets the browser tell this apart from other errors and offer the
// access-code dialog.
export function requireAccess(request: Request): NextResponse | null {
  const token = readCookie(request.headers.get("cookie"), ACCESS_COOKIE);
  if (hasAccess(token, accessCode())) return null;
  return NextResponse.json(
    { error: accessDeniedMessage(), accessRequired: true },
    { status: 401 },
  );
}

// For server components: what the page needs to know about the visitor,
// without ever sending the code itself to the browser.
export async function accessState(): Promise<{ locked: boolean; message: string }> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return { locked: !hasAccess(token, accessCode()), message: accessDeniedMessage() };
}
