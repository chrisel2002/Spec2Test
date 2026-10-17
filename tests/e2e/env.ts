// E2E tests get their own database (never the one in .env.local) and their
// own port, so they can't touch real data or reuse a dev server that's
// running with a real model. CI sets E2E_DATABASE_URL to its service DB.
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://spec2test:spec2test@localhost:5432/spec2test_e2e";

export const E2E_PORT = 3100;
