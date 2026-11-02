import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { db as Database } from "../db";
import { account, session, user, verification } from "../db/schema";
import { env } from "../env";

// Better Auth with email + password; sign-up is disabled because the tool is
// invite-only (TDD 2.1, TDD 3 Authentication & Authorization). Accounts are created
// by our server, never by the public.
function createAuth(db: typeof Database) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    // Rejects requests sent from other websites. It's on by default, but Better Auth
    // turns it off under NODE_ENV=test; setting it keeps tests as strict as production.
    advanced: { disableOriginCheck: false },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthUser = Auth["$Infer"]["Session"]["user"];
export type AuthSession = Auth["$Infer"]["Session"]["session"];

let auth: Promise<Auth> | undefined;

// Created on first use rather than at import: src/db throws on import when
// DATABASE_URL is missing, and the app (and its tests that never sign in) must
// load without one.
export function getAuth(): Promise<Auth> {
  auth ??= import("../db").then(({ db }) => createAuth(db));
  return auth;
}
