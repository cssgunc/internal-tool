import { getAuth } from "../lib/auth";
import type { AuthUser } from "../lib/auth";

export type NewPasswordUser = { email: string; name: string; password: string };

// Creates a Better Auth user who can sign in with this password, the same way
// Better Auth's own sign-up does it (which we can't call: public sign-up is disabled).
// Used by the dev script and tests. Invites come later and set no password.
export async function createPasswordUser({
  email,
  name,
  password,
}: NewPasswordUser): Promise<AuthUser> {
  const { internalAdapter, password: passwords } = await (await getAuth()).$context;

  if (await internalAdapter.findUserByEmail(email)) {
    throw new Error(`A user with email ${email} already exists.`);
  }

  // Hash first, so a bad password fails before any row is written.
  const hash = await passwords.hash(password);
  const user = await internalAdapter.createUser(
    { email, name, emailVerified: true },
    { method: "email-password" }
  );
  await internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hash,
  });
  return user;
}
