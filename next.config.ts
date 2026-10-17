import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E tests set NEXT_DIST_DIR so their dev server gets its own build
  // directory and can run while `pnpm dev` is already running (Next.js
  // allows one dev server per build directory).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
