import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import { chunks, documents } from "@/lib/db/schema";
import { createSpec2TestServer } from "@/mcp/server";

// Uploads a spec saved with Windows line endings through the real ingest
// path (ingest_spec -> service layer -> parse, chunk, embed, store) and
// checks what ended up in Postgres.

const LF_SPEC = [
  "# Line endings spec",
  "",
  "## Login",
  "",
  "The system shall let a user log in",
  "with an email address and a password.",
  "",
  "## Logout",
  "",
  "The system shall end the session when the user logs out.",
  "",
].join("\n");
const CRLF_SPEC = LF_SPEC.replace(/\n/g, "\r\n");

let client: Client;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createSpec2TestServer().connect(serverTransport);
  client = new Client({ name: "line-endings-test", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client?.close();
});

describe("uploading a CRLF spec", () => {
  it("stores LF text with chunk offsets that point at the stored text", async () => {
    const result = (await client.callTool({
      name: "ingest_spec",
      arguments: { markdown: CRLF_SPEC, filename: "line-endings.md" },
    })) as { isError?: boolean; content: { text: string }[] };
    expect(result.isError).toBeFalsy();
    const { documentId } = JSON.parse(result.content[0].text);

    const [document] = await db
      .select({ rawText: documents.rawText })
      .from(documents)
      .where(eq(documents.id, documentId));
    expect(document.rawText).toBe(LF_SPEC);

    const stored = await db
      .select()
      .from(chunks)
      .where(eq(chunks.documentId, documentId))
      .orderBy(asc(chunks.chunkIndex));
    expect(stored.map((c) => c.heading)).toEqual(["Line endings spec", "Login", "Logout"]);
    for (const chunk of stored) {
      expect(chunk.content).not.toMatch(/\r/);
      expect(document.rawText.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.content);
    }
  });
});
