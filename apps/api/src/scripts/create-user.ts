// Dev only: creates a user you can sign in with locally, since public sign-up is
// disabled. Run from the repo root:
//   bun run auth:create-user --email you@example.com --password "at least 8 chars" --name "Your Name"
// Add --member to also create an active member linked to the login, or --superuser
// for a superuser member (needed for superuser pages such as /semesters). If a member
// with that email already exists, it's linked instead.
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
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
    member: { type: "boolean", default: false },
    superuser: { type: "boolean", default: false },
  },
});

const parsed = argsSchema.safeParse({
  email: values.email,
  password: values.password,
  name: values.name,
});
if (!parsed.success) {
  for (const issue of parsed.error.issues) console.error(issue.message);
  process.exit(1);
}

// Links the login to a member record, so the session gets member access.
async function linkMember(userId: string, email: string, name: string, isSuperuser: boolean) {
  const { db } = await import("../db");
  const { members } = await import("../db/schema");
  const [firstName = name, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(" ") || firstName;

  const [existing] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.email, email))
    .limit(1);
  if (existing) {
    await db
      .update(members)
      .set({ userId, isSuperuser, status: "active" })
      .where(eq(members.id, existing.id));
    return "Linked the existing";
  }
  await db.insert(members).values({ userId, email, firstName, lastName, isSuperuser });
  return "Created a";
}

try {
  const user = await createPasswordUser(parsed.data);
  console.log(`Created ${user.email} (id ${user.id}). Sign in at POST /api/auth/sign-in/email.`);
  if (values.member || values.superuser) {
    const isSuperuser = values.superuser === true;
    const verb = await linkMember(user.id, user.email, parsed.data.name, isSuperuser);
    console.log(`${verb} ${isSuperuser ? "superuser " : ""}member for ${user.email}.`);
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
