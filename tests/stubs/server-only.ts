// The real "server-only" package throws when imported outside a React
// Server Components build, which includes plain Node in Vitest. Unit tests
// run server code directly, so vitest.config.mts aliases it to this no-op.
export {};
