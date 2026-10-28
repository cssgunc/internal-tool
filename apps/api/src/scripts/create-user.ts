// Dev only: creates a user you can sign in with locally, since public sign-up is
// disabled. Run from the repo root:
//   bun run auth:create-user --email you@example.com --password "at least 8 chars" --name "Your Name"
import { parseArgs } from "node:util";
import { z } from "zod";
import { env } from "../env";
import { createPasswordUser } from "../services/users";

if (env.NODE_ENV === "production") {
  console.error(
    "Refusing to run: this script is for local development only (NODE_ENV=production)."
  );
  process.exit(1);
}

const argsSchema = z.object({
  email: z.email("--email must be a valid email address"),
  // Better Auth's default password limits.
  password: z
    .string("--password is required")
    .min(8, "--password must be at least 8 characters")
    .max(128, "--password must be at most 128 characters"),
  name: z.string("--name is required").min(1, "--name is required"),
});

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string" },
  },
});

const parsed = argsSchema.safeParse(values);
if (!parsed.success) {
  for (const issue of parsed.error.issues) console.error(issue.message);
  process.exit(1);
}

try {
  const user = await createPasswordUser(parsed.data);
  console.log(`Created ${user.email} (id ${user.id}). Sign in at POST /api/auth/sign-in/email.`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
