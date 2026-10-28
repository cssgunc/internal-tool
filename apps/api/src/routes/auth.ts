import { Hono } from "hono";
import { getAuth } from "../lib/auth";

// Better Auth's own routes (sign-in, sign-out, get-session, ...) under /api/auth/*
// (TDD 3.2 Auth & Session). Better Auth handles the request and the response itself.
export const authRoutes = new Hono().on(["GET", "POST"], "/*", async (c) => {
  const auth = await getAuth();
  return auth.handler(c.req.raw);
});
