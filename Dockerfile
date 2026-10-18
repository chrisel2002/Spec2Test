# Production image for Spec2Test: Next.js standalone output on Node 22.
# Three stages, so the final image contains only the compiled server and
# the node_modules files it uses, not the toolchain or the source.
#
# No secrets here: every secret is an environment variable set on the host
# (see render.yaml). Database migrations are not run on start; they run
# once from a laptop with `pnpm db:migrate:prod` before a deploy.

FROM node:22-alpine AS base
# pnpm, at the exact version package.json pins.
RUN corepack enable
WORKDIR /app

# 1. Dependencies, in their own layer so they're only reinstalled when the
#    lockfile changes. --ignore-scripts skips our "prepare" script (it
#    builds the MCP server, which the web image doesn't need).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# 2. Build.
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Not a secret and never connected to: modules that read DATABASE_URL when
# imported need a value while Next.js collects page data at build time.
# The real URL is only ever given to the running container.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build pnpm exec next build

# 3. Runtime: just the standalone server and its static assets. (There is
#    no public/ folder; add a COPY for it if one is ever needed.)
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=10000 \
    # Render's free instance has 512 MB of RAM. Capping the V8 heap well
    # below that leaves room for buffers and native memory, so a busy
    # moment slows the server down with garbage collection instead of
    # getting it killed for running out of memory.
    NODE_OPTIONS=--max-old-space-size=320

# The node image's built-in unprivileged user: the server never runs as root.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node

EXPOSE 10000
CMD ["node", "server.js"]
