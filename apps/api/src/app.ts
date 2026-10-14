import { Hono } from "hono";
import { health } from "./routes/health";

// All API routes live under /api/v1 (TDD 3.2). Better Auth will mount its own
// routes under /api/auth when auth is added.
// Add each new resource as its own file in src/routes and chain it here.
export const app = new Hono().basePath("/api/v1").route("/health", health);

// Imported by apps/web for Hono's typed client (see apps/web/src/lib/api.ts).
export type AppType = typeof app;
