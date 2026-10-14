import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. See apps/api/.env.example.");
}

const client = postgres(env.DATABASE_URL);

export const db = drizzle(client, { schema });
