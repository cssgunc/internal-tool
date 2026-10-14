import { hc } from "hono/client";
import type { AppType } from "@internal-tool/api/app";

// Typed API client. Request and response types come straight from the Hono
// routes in apps/api, so a backend change that breaks the frontend fails the
// type check. Relative URL because Next.js forwards /api/* to the API.
// Example: const res = await api.api.v1.health.$get();
export const api = hc<AppType>("/");
