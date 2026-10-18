# Spec2Test

Turn software requirements into test cases with AI agents.

![Spec2Test paused for human review: live agent steps, coverage, and requirement cards with an ambiguous requirement highlighted](docs/images/main-screen.png)

<sub>A run paused at the human-review checkpoint (synthetic spec, mock model). A GIF of the full flow will replace this.</sub>

## Features

- **Upload a spec** as PDF or Markdown; it's chunked and embedded for retrieval
- **Requirement extraction** into atomic requirements, with ambiguous or untestable ones flagged and a suggested rewrite
- **Test case generation** in Given/When/Then form, linked to each requirement
- **Live agent progress**: every step, and progress within a step ("Generating tests 5/12"), streams to the browser as it happens; requirements appear as they're extracted
- **Human review**: approve, edit, or reject each test; resolve ambiguous requirements by accepting the suggested rewrite or writing your own, which regenerates that requirement's tests. Every change is recorded (who, what, when)
- **Human-in-the-loop checkpoint**: the agent pauses after generating tests and only builds the matrix once a person clicks **Build matrix**
- **Traceability matrix** with requirement-to-test links, review statuses, highlighted gaps, and filters
- **Run history**: every run is kept and can be reopened; the open run is in the URL, so it survives a refresh, and failed runs retry from the step that failed
- **Exports** for a signed-off run: the matrix as CSV (Excel-ready, optionally approved tests only), Playwright test skeletons as a zip (one `.spec.ts` per requirement, a `test.fixme` per approved test), and a Markdown report for a ticket or pull request
- **MCP server** so AI agents like Claude Code can use Spec2Test as a tool: ingest specs, start runs, read requirements and the matrix, export tests. Human review stays in the web app
- **Chat with spec**: questions answered only from retrieved excerpts, with citations
- **Voice output (ElevenLabs)**: "Listen" buttons read chat answers and a short run summary aloud. Optional, and hidden when no API key is set

## Tech stack

- **App:** Next.js (App Router) with TypeScript in strict mode
- **UI:** Tailwind CSS + shadcn/ui
- **Validation:** Zod for all inputs, API payloads, and LLM structured outputs
- **Database:** PostgreSQL with the pgvector extension, accessed through Drizzle ORM
- **AI:** Vercel AI SDK for model calls, streaming, and tool calling; LangGraph.js for the agent graph
- **Testing:** Vitest for unit tests, Playwright for end-to-end tests, plus an eval script in `evals/`
- **Infrastructure:** Docker Compose for local development, GitHub Actions for CI, GCP Cloud Run for deployment
- **Package manager:** pnpm

## Running locally

1. Copy the environment template and fill in real values:
   ```
   cp .env.example .env.local
   ```
2. Start PostgreSQL with pgvector:
   ```
   docker compose up -d
   ```
3. Install dependencies and apply database migrations:
   ```
   pnpm install
   pnpm db:migrate
   ```
4. Start the dev server:
   ```
   pnpm dev
   ```
5. Check everything is wired up at [http://localhost:3000/api/health](http://localhost:3000/api/health).

### Other commands

```
pnpm test               run unit tests (no DB or API key needed)
pnpm test:integration   run tests against a real DB + embedding API (needs .env.local)
pnpm test:e2e           run Playwright tests (own spec2test_e2e database, mock model, no API keys)
pnpm test:mcp           run the MCP server tests (own spec2test_mcp database, mock model, no API keys)
pnpm mcp                start the MCP server on stdio (normally Claude Code starts it for you)
pnpm eval               run the eval script
pnpm db:generate        generate a new Drizzle migration after changing the schema
pnpm tts:hello          smoke-test ElevenLabs: writes output/hello.mp3 (needs ELEVENLABS_API_KEY)
pnpm lint               lint and type-check
```

## Use Spec2Test from Claude Code (MCP)

Spec2Test is also an [MCP](https://modelcontextprotocol.io) server, so AI
agents like Claude Code can use it as a tool: ingest a spec, start a run,
read the requirements and the traceability matrix, and export Playwright
tests. It runs locally over stdio and uses the same database and
`.env.local` as the web app.

**Register it.** The repo includes a project-scoped `.mcp.json`, so
running `claude` in the repo asks you once to approve the `spec2test`
server. To register it yourself, run this from the repo root:

```
claude mcp add --scope project spec2test -- node --conditions=react-server --import tsx src/mcp/main.ts
```

To use it from any directory, register it for your user through pnpm
(on Windows, put `cmd /c` before `pnpm`):

```
claude mcp add --scope user spec2test -- pnpm --silent --dir /path/to/Spec2Test mcp
```

Check it with `claude mcp list`, or `/mcp` inside a session. Postgres must
be running (`docker compose up -d`), and the web app too (`pnpm dev`) for
the review step.

**Tools:** `list_documents`, `ingest_spec` (a file path or Markdown text),
`start_run`, `get_run_status`, `get_requirements` (with ambiguity flags),
`get_traceability_matrix` (with coverage and gaps), and
`export_playwright_tests` (writes the files into a folder you name).

There is deliberately no tool to approve tests or build the matrix. When a
run pauses for review, `get_run_status` returns `waiting_for_review` with
the link to the review screen, and the agent hands it to you:

> **You:** Ingest sample-specs/login-account-spec.md, start a run, and tell
> me which requirements are ambiguous.
>
> **Claude:** *(calls `ingest_spec`, `start_run`, polls `get_run_status`,
> then `get_requirements` with `ambiguousOnly`)* The run extracted 16
> requirements and drafted 32 test cases, and is now waiting for review.
> Three requirements are ambiguous:
>
> | Code | Requirement | Problem |
> |---|---|---|
> | REQ-05 | The login experience should feel fast and responsive. | "fast" has no measurable threshold |
> | REQ-13 | Password reset emails should be delivered quickly. | "quickly" has no threshold |
> | REQ-15 | The system should be secure against common attacks. | "secure" isn't testable as written |
>
> I can't approve the test cases: Spec2Test only counts tests a person has
> signed off. Review them at http://localhost:3000/?run=37640c8b-… , click
> **Build matrix**, and I'll fetch the traceability matrix.
>
> **You:** Done. Show me the coverage and export the Playwright tests to
> ./e2e/generated.
>
> **Claude:** *(calls `get_traceability_matrix` and
> `export_playwright_tests`)* Coverage is 23%: 3 of 13 testable
> requirements have an approved test. 13 gaps: 3 unresolved ambiguities
> and 10 requirements with only draft tests. I wrote 3 spec files to
> ./e2e/generated.

(Abridged from a real session against the mock model.)

## Architecture

Spec2Test has two front doors, the web app and the MCP server, and both
go through one service layer (`src/lib/services/`). Neither contains
business logic of its own: the API routes translate HTTP, the MCP tools
translate tool calls, and the services do the work.

```mermaid
flowchart LR
    browser([Browser]) --> routes["Next.js API routes<br/>+ server-rendered page"]
    claude([Claude Code / AI agent]) -- "MCP over stdio" --> mcp["MCP server<br/>src/mcp"]

    subgraph services["Service layer · src/lib/services"]
        direction TB
        docs[documents<br/>list, ingest]
        runsvc[runs<br/>start, status, resume, retry]
        review[review<br/>approve, edit, reject, rewrite]
        matrix[matrix<br/>requirements, coverage, gaps]
        exports[exports<br/>CSV, Playwright, report]
    end

    routes --> services
    mcp --> services
    services --> agent[LangGraph.js agent]
    services --> db[(PostgreSQL + pgvector)]
    agent --> db

    mcp -. "no tools: review stays in the web app" .-> review

    classDef human fill:#fef3c7,stroke:#d97706,color:#78350f
    class review human
```

The review service is only reachable from the web app: the MCP server
has no tool for it (see the design decisions below).

### The agent pipeline

Uploading a spec runs it through parsing → chunking → embedding (see the
chunking design decision below). Clicking **Run agent** on a document then
runs a LangGraph.js pipeline over that document's chunks, with a
human-in-the-loop checkpoint before the matrix is built:

```mermaid
flowchart TD
    START((start)) --> extract[Extract requirements]
    extract -- found 0 requirements --> stop((end))
    extract -- found requirements --> ambiguity[Check ambiguity]
    ambiguity --> tests[Generate tests]
    tests --> review{{"Human review<br/>interrupt(): run pauses"}}
    review -. "approve / edit / reject,<br/>resolve ambiguity" .-> review
    review -- "Build matrix<br/>Command({ resume })" --> matrix[Build matrix]
    matrix --> done((end))

    classDef human fill:#fef3c7,stroke:#d97706,color:#78350f
    class review human
```

- **Extract requirements** reads the document's chunks and pulls out
  atomic, testable requirements, splitting compound ones ("shall do A and
  B") apart. Every requirement must cite which chunk(s) it came from.
- **Check ambiguity** reviews each requirement's own text for vague
  wording, missing thresholds, or undefined terms, and — only when it
  finds a problem — proposes a measurable rewrite.
- **Generate tests** writes 2-4 Given/When/Then test cases per
  requirement (from the rewrite, for ambiguous ones), covering at least
  one positive and, where it makes sense, one negative/boundary case.

- **Human review** calls LangGraph's `interrupt()`. The run's state is
  checkpointed in Postgres and the run waits, for as long as review takes,
  while the reviewer works in the UI. **Build matrix** resumes it.
- **Build matrix** records the reviewed coverage on the run and completes
  it; the run is then a read-only, signed-off record.

If extraction finds zero requirements, the graph ends right there instead
of running ambiguity checks and test generation over nothing. Each node
records its own status, token usage, and estimated cost to `agent_runs`
before handing off to the next one (`src/lib/agents/`).

### How progress reaches the browser

```
node ──config.writer──▶ graph.stream({ streamMode: "custom" }) ──▶ runner ──▶ event bus ──▶ GET /api/runs/:id/events (SSE) ──▶ EventSource ──▶ reducer ──▶ UI
```

A run executes in the background (Next.js `after()`), not inside the
request that started it. Nodes emit typed, Zod-validated events through
LangGraph's custom stream mode (step started, finished, or failed;
progress within a step; each saved batch of requirements and tests). The
runner relays them to an in-process event bus, and the SSE route sends
each browser a snapshot from the database followed by live events. Every
event carries full rows, so the client's reducer can apply one twice
without harm, which is what makes reconnecting after a refresh safe.

### Coverage

Coverage = testable requirements with at least one **approved** test ÷
all testable requirements. A requirement is testable unless it's
ambiguous and nobody has resolved it yet. Draft and rejected tests don't
count. It's calculated by one pure function (`src/lib/review/coverage.ts`),
live in the sidebar, and snapshotted on the run when the matrix is built.

## Design decisions

### Why a graph of focused nodes instead of one big prompt

Each node does exactly one job — extract, judge testability, or write
tests — with its own narrow prompt and its own Zod schema. A single
"read this spec and produce requirements with tests" prompt would have to
hold all three jobs' instructions and output shapes in its head at once,
which tends to produce shallower results on every sub-task as the prompt
grows, and makes "why did this requirement get this test?" unanswerable
(the model made every decision in one undifferentiated pass). Separate
nodes also fail independently and visibly — `agent_runs` shows exactly
which step broke, not just "the pipeline failed somewhere" — and each
step's prompt and schema can be improved without touching the other two.

### Why the agent pauses for human review

The agent could go straight from generated tests to a finished matrix,
but that matrix would claim coverage that nobody checked. LLM-written
tests are drafts: some miss the point of the requirement, some assert
things the spec never said, and tests for an ambiguous requirement rest on
the model's guess at what it meant. A traceability matrix is evidence
that requirements are covered, so a number built from unreviewed drafts
is worse than no number.

So the graph stops at a checkpoint after test generation. A person
approves, edits, or rejects each test and settles every ambiguous
requirement, and only then does **Build matrix** resume the run. Coverage
counts approved tests only, unresolved ambiguities show up as gaps, and
every decision is logged with who made it. The agent does the slow part
(reading the spec, drafting dozens of tests); the human makes the calls
that need judgement.

The pause is a real LangGraph `interrupt()` with a Postgres checkpointer
(`@langchain/langgraph-checkpoint-postgres`) rather than ending the run
and starting a second one later. The run stays one unit with one history,
the pause survives server restarts and redeploys, and the same
checkpoints let a failed run retry from the step that failed instead of
from scratch. The alternative, LangGraph's in-memory `MemorySaver`, would
lose every paused run on restart.

### Why the MCP server can't bypass human review

An agent connected over MCP can do everything except the judgement calls.
It can ingest a spec, start a run, read the ambiguity flags, and read and
export the matrix, but there is no tool to approve, edit, or reject a
test, resolve an ambiguity, or build the matrix. When a run is paused,
`get_run_status` returns `waiting_for_review`, the URL of the review
screen, and a `nextAction` telling the agent to hand that link to the
user and wait. The server's instructions and tool descriptions explain
why, so the agent can explain it to the user instead of looking for a
workaround.

The reason is the same as for the checkpoint itself: coverage counts only
tests a person has signed off, and that's what makes the number worth
anything. An agent that approves the tests it just asked another agent
to write has removed the human from the loop while keeping the
appearance of review. Leaving the tools out is stronger than a
permission check inside them: an agent can't call a tool that doesn't
exist, however it's prompted. The service layer enforces the same rule
underneath (exports refuse a run that isn't signed off), so it holds for
any future interface too.

The trade-off is that a fully automated pipeline can't run end to end.
That's intended here. If it were ever needed, the place for it would be
an explicit, audited "auto-approve" policy in the service layer, not a
tool an agent can decide to call.

### Why both interfaces share one service layer

The web app and the MCP server do the same things: start a run, read its
status, build the matrix, export it. If each had its own copy of that
logic, they would drift. The MCP server would forget a check the web
app has ("is this document ready?", "is a run already in progress?"), or
compute coverage slightly differently, and the same run would look
different depending on who asked.

So every core action lives once in `src/lib/services/`. API routes and
MCP tools are thin adapters: parse the input, call a service, translate
the result (JSON and status codes for HTTP, tool results for MCP). A
`ServiceError` with a kind (`invalid`, `not_found`, `conflict`,
`rate_limited`) lets each adapter map failures its own way. Things that
differ between the two, like how background work is scheduled (Next.js
`after()` in the web app, a plain promise in the long-lived MCP process),
are passed in rather than hard-coded.

This also made a real bug visible. With two processes able to run the
agent, "is this run alive?" could no longer mean "is this process running
it?", so run liveness moved to a heartbeat in the database, where both
processes see it.

### Why server-sent events instead of the AI SDK's stream

The Vercel AI SDK's UI message stream is built for chat: messages made of
text and data parts, tied to the request that produced them. Agent
progress is a different shape, a one-way feed of pipeline events (step
started, 5 of 12 done, here are 3 new requirements) with no LLM text to
stream. Plain SSE fits that directly: a `ReadableStream` on the server, the
browser's built-in `EventSource` (with automatic reconnection) on the
client, and a Zod-validated event union shared by both.

Decoupling the run from the connection matters more than the transport.
The run executes in the background and publishes to an event bus; any
number of browser connections subscribe to it and start from a database
snapshot. Closing the tab doesn't stop the run, and reopening it picks up
where it is. The limitation is that the bus is in-process: with several
Cloud Run instances, the next step would be Postgres `LISTEN/NOTIFY` or
Redis pub/sub.

### Why every output goes through a Zod schema

An LLM asked for free-text JSON will occasionally hand back malformed
JSON, miss a field, or invent one — not often, but at the batch counts
this pipeline runs over free-tier rate limits, often enough to matter.
`generateObject()` validates the model's output against a Zod schema
before any of our code sees it, so a bad response surfaces immediately as
a validation error (retried, then failed loudly) instead of silently
propagating a malformed requirement or test case into the database. The
schemas also do more than type-check: `sourceChunkRefs.min(1)` makes an
ungrounded requirement a schema violation rather than a prompt
suggestion, and `AmbiguityResultSchema`'s `.refine()` makes "ambiguous
with no reason" structurally impossible to return.

### Chunking strategy

Chunking happens in two passes (`src/lib/ingest/chunk.ts`). First, the
document is split by heading — every `#`/`##`/`###` (or, for PDFs, every
detected heading) starts a new section, so a section is never larger than
the text between two headings. Second, any section still longer than
**800 characters** (roughly 150–200 tokens) is split further into
~800-char pieces with **100 characters (~12%) of overlap**, snapping each
cut to the nearest whitespace so words aren't broken mid-token.

800/100 was chosen as a balance: small enough that a chunk stays about one
topic, which matters because the chat UI cites the exact chunk an answer
came from — a chunk spanning three unrelated requirements would make a
citation misleading. Large enough that retrieval isn't flooded with
hundreds of near-duplicate fragments, and that each chunk carries enough
surrounding context to be a sensible embedding input on its own. The
overlap exists so a sentence that happens to fall right at a split point
still appears in full in at least one chunk, instead of being cut in half
and missed by both.

In practice, most sections in our sample specs (one requirement per
heading) are well under 800 characters, so they usually end up as exactly
one chunk each — the size-based splitting mostly matters for longer
free-text sections rather than our requirement-style documents.

### Why pgvector instead of a separate vector database

The whole dataset for this project is a handful of uploaded specs —
hundreds to low thousands of chunks, not millions. At that scale, a
dedicated vector database (Pinecone, Weaviate, Qdrant, …) adds an extra
service to run, pay for, and keep in sync with Postgres, without a
performance benefit pgvector doesn't already provide (we use an HNSW
index with cosine distance, which is the same algorithm most dedicated
vector DBs use under the hood).

Keeping embeddings in the same Postgres database as `documents`,
`requirements`, and `test_cases` also means a single transaction can
touch both relational and vector data — e.g. deleting a document cascades
to its chunks automatically via a foreign key — and local dev only needs
one `docker compose up` instead of standing up a second service. The
trade-off is that pgvector wouldn't be the right call at a much larger
scale (tens of millions of vectors, or needing features like serverless
auto-scaling of the index) — but that's not this project.

### Why voice is generated server-side and cached

The browser never talks to ElevenLabs directly. It posts text to
`/api/voice`, and the server calls ElevenLabs with the key from its own
environment and streams the MP3 back. Calling ElevenLabs from the client
would mean shipping the API key to every visitor. The server-side route is
also where the Zod length cap (1,000 characters) is enforced, so nobody can
drain the quota with huge requests.

Generated audio is cached in Postgres (`audio_cache`), keyed by a SHA-256
of the text, voice ID, and model ID. ElevenLabs bills per character, and
the same run summary or chat answer is often played more than once, so a
replay costs one primary-key lookup instead of quota. Postgres beat a
folder on disk because Cloud Run's filesystem is per-instance and wiped on
every restart, so a disk cache would silently stop working once deployed.
The trade-off is binary blobs in the database and no eviction yet. Clips
are ~30–100 KB, which is fine at this scale; an object store like GCS
would be the next step if it grew.

Voice is optional. Without `ELEVENLABS_API_KEY`, the server tells the UI
voice is off (a boolean, never the key), the Listen buttons don't render,
and `/api/voice` returns 503. That's also why CI needs no ElevenLabs key.
