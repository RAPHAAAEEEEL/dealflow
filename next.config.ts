import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Quick Add reads the Screening Criteria at request time, so the file ships with the server code.
  outputFileTracingIncludes: { "/**": ["./criteria/screening-criteria.md"] },
};

export default nextConfig;
