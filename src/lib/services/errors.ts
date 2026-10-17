import { z } from "zod";

// What went wrong, in terms every interface can translate: the HTTP routes
// map it to a status code, the MCP server to a tool error with the message.
export type ServiceErrorKind = "invalid" | "not_found" | "conflict" | "rate_limited";

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly kind: ServiceErrorKind,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

// Ids arrive as raw strings from URLs and from MCP tool calls alike, so the
// services validate them rather than trusting each caller to.
export function requireUuid(value: string, label: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ServiceError(`Invalid ${label} id`, "invalid");
  return parsed.data;
}
