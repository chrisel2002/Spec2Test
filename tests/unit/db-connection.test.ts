import { describe, expect, it } from "vitest";

import { describeDatabase, postgresConfig } from "@/lib/db/connection";

const NEON_POOLED =
  "postgresql://app:s3cret@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const NEON_DIRECT =
  "postgresql://app:s3cret@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

describe("postgresConfig", () => {
  it("drops channel_binding, which postgres.js would send to the server and fail on", () => {
    const { url } = postgresConfig(NEON_POOLED);
    expect(url).not.toContain("channel_binding");
    expect(new URL(url).searchParams.get("sslmode")).toBe("require");
  });

  it("turns prepared statements off for Neon's pooled (PgBouncer) host", () => {
    expect(postgresConfig(NEON_POOLED).prepare).toBe(false);
  });

  it("keeps prepared statements for direct and local connections", () => {
    expect(postgresConfig(NEON_DIRECT).prepare).toBe(true);
    expect(postgresConfig("postgresql://spec2test:spec2test@localhost:5432/spec2test").prepare).toBe(true);
  });

  it("leaves a plain local URL as it was", () => {
    expect(postgresConfig("postgresql://spec2test:spec2test@localhost:5432/spec2test").url).toBe(
      "postgresql://spec2test:spec2test@localhost:5432/spec2test",
    );
  });
});

describe("describeDatabase", () => {
  it("names the host and database without the credentials", () => {
    const text = describeDatabase(NEON_DIRECT);
    expect(text).toBe("ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb");
    expect(text).not.toContain("s3cret");
  });
});
