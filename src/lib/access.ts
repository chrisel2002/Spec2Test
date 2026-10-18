import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Demo mode's access code. The public deployment shows pre-run sample
// results to everyone, but anything that calls a model API (upload,
// running the agents, chat, voice) or changes the shared demo data (review)
// needs a code, so the free API quotas can't be spent by every visitor.
//
// With ACCESS_CODE unset (local development, CI, the e2e server) nothing
// is gated.
//
// How a visitor gets in: POST /api/access with the code. If it matches, the
// response sets an httpOnly cookie, and gated routes check that cookie. The
// cookie holds an HMAC of the code, not the code itself: a cookie copied
// out of a browser doesn't reveal the code, and changing ACCESS_CODE in the
// dashboard signs every visitor out. A signed session (a JWT, or a session
// table) would allow per-visitor expiry or revocation, which a single
// shared demo code doesn't need.

export const ACCESS_COOKIE = "spec2test_access";

// Fixed message the cookie value is an HMAC of. Changing it signs everyone
// out, like changing the code.
const TOKEN_MESSAGE = "spec2test-access-v1";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Constant-time comparison of a submitted code with the real one.
// timingSafeEqual needs equal-length buffers, so both are hashed first:
// comparing hashes takes the same time whatever the input, and the length
// check that would otherwise come first can't leak the code's length.
export function codeMatches(submitted: string, expected: string): boolean {
  return timingSafeEqual(sha256(submitted), sha256(expected));
}

export function accessToken(code: string): string {
  return createHmac("sha256", code).update(TOKEN_MESSAGE).digest("base64url");
}

// Reads one cookie out of a Cookie header ("a=1; b=2").
export function readCookie(header: string | null, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

// Whether a visitor with this access cookie value may use gated features.
// `code` is ACCESS_CODE; passed in (rather than read here) so tests don't
// have to touch process.env.
export function hasAccess(token: string | null | undefined, code: string | undefined): boolean {
  if (!code) return true;
  return typeof token === "string" && codeMatches(token, accessToken(code));
}

export function accessCode(): string | undefined {
  return process.env.ACCESS_CODE || undefined;
}

// Shown wherever a gated action is refused, in the browser and in API
// responses. ACCESS_CODE_CONTACT says how to ask for a code (an email
// address or a URL, say); it's public text, not a secret.
export function accessDeniedMessage(): string {
  const contact = process.env.ACCESS_CODE_CONTACT;
  return [
    "This is a public demo: the sample results are open to everyone, but uploading, running the agents, reviewing, chat and voice need an access code, to protect the free AI quotas.",
    contact ? `To get a code, ${contact}.` : "To get a code, ask whoever shared this link with you.",
    "Or run Spec2Test yourself: the README's quickstart works with a free Gemini key.",
  ].join(" ");
}
