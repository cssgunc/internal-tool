import type { NextConfig } from "next";

// The browser only ever talks to this app. Requests to /api/* are forwarded to
// the Hono API, so the session cookie stays on one domain (TDD 3).
const apiUrl = process.env.API_URL ?? "http://localhost:8787";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
