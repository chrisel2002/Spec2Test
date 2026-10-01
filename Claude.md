# Spec2Test

Turn software requirements into test cases with AI agents.

Users upload a requirements document (PDF or Markdown). An agent pipeline extracts atomic requirements, flags ambiguous or untestable ones, generates Given/When/Then test cases, and builds a traceability matrix. A human reviews and approves the test cases. Results can be exported as CSV or Playwright test skeletons. The app also exposes its core tools through an MCP server.

This is a portfolio project, built in one week. Code quality, readability, and a clean Git history matter more than feature count.

## Tech stack

- **App:** Next.js (App Router) with TypeScript in strict mode
- **UI:** Tailwind CSS + shadcn/ui
- **Validation:** Zod for all inputs, API payloads, and LLM structured outputs
- **Database:** PostgreSQL with the pgvector extension, accessed through Drizzle ORM
- **AI:** Vercel AI SDK for model calls, streaming, and tool calling; LangGraph.js for the agent graph
- **Models:** provider-agnostic. Read the provider and model names from environment variables so OpenAI and Anthropic can be switched without code changes.
- **Testing:** Vitest for unit tests, Playwright for end-to-end tests, plus an eval script in `evals/`
- **Infrastructure:** Docker Compose for local development, GitHub Actions for CI, GCP Cloud Run for deployment
- **Package manager:** pnpm

## Project structure

```
src/
  app/            Next.js routes and pages
  components/     UI components (shadcn/ui lives in components/ui)
  lib/
    db/           Drizzle schema, client, migrations
    ai/           model setup, prompts, embeddings
    agents/       LangGraph.js graph, nodes, and state
    ingest/       parsing and chunking
    export/       CSV and Playwright exporters
  mcp/            MCP server exposing the core tools
evals/            golden dataset and eval runner
tests/
  unit/           Vitest
  e2e/            Playwright
sample-specs/     synthetic requirement documents for demos and evals
```

## Data model

- `documents`: uploaded specs
- `chunks`: text chunks with embeddings (pgvector)
- `requirements`: extracted requirements, with an ambiguity flag and reason
- `test_cases`: Given/When/Then steps, status (draft, approved, rejected), and a link to their requirement
- `agent_runs`: status per step, token usage, and cost

## Conventions

- TypeScript strict mode, no `any`. Infer types from Zod schemas and Drizzle tables where possible.
- Every LLM call that returns structured data must use a Zod schema, not free-text parsing.
- Keep prompts in `src/lib/ai/prompts/`, never inline inside components or route handlers.
- Server-only code (database, API keys, model calls) must never be imported into client components.
- Secrets live in `.env.local`. Keep `.env.example` up to date whenever a new variable is added.
- Write a unit test for every non-trivial function in `lib/`.
- Use small, focused commits with conventional commit messages (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).

## Working with me

- I want to understand every part of this codebase well enough to explain it in a job interview. When you add something non-obvious, explain briefly why you chose that approach and what the alternatives were.
- Before larger changes, show me a short plan first.
- Prefer simple, readable solutions over clever ones.
- When fixing code, show exact line-level changes rather than rewriting whole files.
- Only use synthetic or public sample requirements. Never use real company documents.

## Commands

```
pnpm dev            start the app
pnpm test           run unit tests
pnpm test:e2e       run Playwright tests
pnpm eval           run the eval script
pnpm db:generate    generate Drizzle migrations
pnpm db:migrate     apply migrations
pnpm lint           lint and type-check
docker compose up   start Postgres with pgvector
```