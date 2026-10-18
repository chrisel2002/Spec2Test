import { NoObjectGeneratedError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateObject: vi.fn(),
}));
vi.mock("@/lib/ai/providers", () => ({ getChatModel: () => ({}) }));

import { generateObject } from "ai";

import {
  generateStructured,
  observeStructuredCalls,
  type StructuredCallEvent,
} from "@/lib/ai/generate-structured";

const mockGenerateObject = vi.mocked(generateObject);
const schema = z.object({ answer: z.string() });
const options = { schema, system: "s", prompt: "p" };

function usage(total: number) {
  return { inputTokens: total / 2, outputTokens: total / 2, totalTokens: total };
}

function success(total: number) {
  return { object: { answer: "ok" }, usage: usage(total) } as unknown as Awaited<
    ReturnType<typeof generateObject>
  >;
}

function schemaFailure(total: number) {
  return new NoObjectGeneratedError({
    message: "response did not match schema",
    response: { id: "r", timestamp: new Date(0), modelId: "m" },
    usage: usage(total) as NoObjectGeneratedError["usage"] & object,
    finishReason: "stop",
  });
}

let events: StructuredCallEvent[];

beforeEach(() => {
  delete process.env.MODEL_PROVIDER;
  mockGenerateObject.mockReset();
  events = [];
  observeStructuredCalls((event) => events.push(event));
});

describe("generateStructured", () => {
  it("returns the object and reports a first-try success", async () => {
    mockGenerateObject.mockResolvedValueOnce(success(10));

    const result = await generateStructured(options);

    expect(result).toEqual({ object: { answer: "ok" }, usage: usage(10) });
    expect(events.at(-1)).toMatchObject({ schemaValidFirstTry: true, attempts: 1, succeeded: true });
  });

  it("retries once after a schema failure, counting both attempts' tokens", async () => {
    mockGenerateObject.mockRejectedValueOnce(schemaFailure(6)).mockResolvedValueOnce(success(10));

    const result = await generateStructured(options);

    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(result.usage.totalTokens).toBe(16);
    expect(events.at(-1)).toMatchObject({ schemaValidFirstTry: false, attempts: 2, succeeded: true });
  });

  it("gives up after a second schema failure", async () => {
    mockGenerateObject.mockRejectedValue(schemaFailure(6));

    await expect(generateStructured(options)).rejects.toBeInstanceOf(NoObjectGeneratedError);
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({ succeeded: false, attempts: 2 });
  });

  it("doesn't retry other errors (the SDK already retried network errors)", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("network down"));

    await expect(generateStructured(options)).rejects.toThrow("network down");
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("stops reporting to an observer once it unsubscribes", async () => {
    const seen: StructuredCallEvent[] = [];
    const unsubscribe = observeStructuredCalls((event) => seen.push(event));
    unsubscribe();
    mockGenerateObject.mockResolvedValueOnce(success(10));

    await generateStructured(options);

    expect(seen).toEqual([]);
  });
});
