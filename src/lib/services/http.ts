import "server-only";

import { NextResponse } from "next/server";

import { ServiceError, type ServiceErrorKind } from "./errors";

const STATUS: Record<ServiceErrorKind, number> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

// Route handlers wrap their service call in this, so the HTTP layer stays
// a translation: service result -> JSON, ServiceError -> status + message,
// anything else -> a logged 500 with a message that leaks nothing.
export async function respond<T>(
  action: () => Promise<T>,
  options: { fallbackError: string; status?: number },
): Promise<NextResponse> {
  try {
    return NextResponse.json(await action(), { status: options.status ?? 200 });
  } catch (error) {
    return errorResponse(error, options.fallbackError);
  }
}

export function errorResponse(error: unknown, fallbackError: string): NextResponse {
  if (error instanceof ServiceError) {
    return NextResponse.json({ error: error.message }, { status: STATUS[error.kind] });
  }
  console.error(fallbackError, error);
  return NextResponse.json({ error: fallbackError }, { status: 500 });
}
