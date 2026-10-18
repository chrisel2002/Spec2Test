import "server-only";

import { NextResponse } from "next/server";

import { clientKey, RateLimiter } from "@/lib/rate-limit";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Each policy limits one client and, separately, everyone together. The
// global limits are the quota guard: a run makes about 30 model calls, so
// 10 runs an hour stays inside Gemini's free daily request quota even if
// it's sustained all day.
const POLICIES = {
  // Uploads and resumed embeddings spend the embedding quota.
  upload: { client: [10, 10 * MINUTE], global: [60, HOUR], noun: "uploads" },
  // Starting or retrying a run, or regenerating tests after a rewrite.
  model: { client: [5, 10 * MINUTE], global: [10, HOUR], noun: "agent runs" },
  chat: { client: [20, 10 * MINUTE], global: [200, HOUR], noun: "chat questions" },
  // ElevenLabs bills per character.
  voice: { client: [20, 10 * MINUTE], global: [100, HOUR], noun: "voice requests" },
  // Access-code attempts: slow enough that guessing a code is hopeless.
  access: { client: [5, 10 * MINUTE], global: [50, HOUR], noun: "access code attempts" },
} as const;

export type RateLimitPolicy = keyof typeof POLICIES;

type Limiters = Record<RateLimitPolicy, { client: RateLimiter; global: RateLimiter }>;

// On globalThis so every route bundle (and hot reload) shares one count.
const globalForLimits = globalThis as unknown as { rateLimiters?: Limiters };
const limiters = (globalForLimits.rateLimiters ??= Object.fromEntries(
  Object.entries(POLICIES).map(([name, policy]) => [
    name,
    {
      client: new RateLimiter(policy.client[0], policy.client[1]),
      global: new RateLimiter(policy.global[0], policy.global[1]),
    },
  ]),
) as Limiters);

function retryText(ms: number): string {
  const minutes = Math.ceil(ms / MINUTE);
  return ms < MINUTE ? `${Math.ceil(ms / 1000)} seconds` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// Call at the top of a route. Returns a 429 response to send back, or null
// if the request may go ahead.
export function rateLimit(request: Request, policyName: RateLimitPolicy): NextResponse | null {
  // Off for the e2e test server, which starts more runs per hour than the
  // global limit allows; the limiter itself has unit tests.
  if (process.env.RATE_LIMITS === "off") return null;
  const policy = POLICIES[policyName];
  const { client, global } = limiters[policyName];

  const own = client.check(clientKey(request.headers));
  const all = own.allowed ? global.check("*") : own;
  if (all.allowed) return null;

  const message = !own.allowed
    ? `Too many ${policy.noun} from you in a short time. Try again in ${retryText(all.retryAfterMs)}.`
    : `Spec2Test has hit its limit for ${policy.noun} for now, to protect its free API quota. Try again in ${retryText(all.retryAfterMs)}.`;
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(Math.ceil(all.retryAfterMs / 1000)) } },
  );
}
