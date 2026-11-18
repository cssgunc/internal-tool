import { sendEmail } from "./index";
import type { SendResult } from "./types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// The reset link Better Auth generates for "Forgot password". The wording moves to the
// editable password_reset template once the email templates ticket lands (TDD 2.3).
export function sendPasswordResetEmail(
  { user, url }: { user: { email: string; name?: string | null }; url: string },
  send: typeof sendEmail = sendEmail
): Promise<SendResult> {
  const greeting = user.name ? `Hi ${user.name},` : "Hi,";
  return send({
    to: user.email,
    subject: "Reset your CSSG password",
    html:
      `<p>${escapeHtml(greeting)}</p>` +
      `<p>Someone asked to reset the password for your CSSG account. ` +
      `<a href="${escapeHtml(url)}">Choose a new password</a>. The link expires in an hour.</p>` +
      `<p>If that wasn't you, you can ignore this email.</p>`,
    text:
      `${greeting}\n\nSomeone asked to reset the password for your CSSG account. ` +
      `Choose a new password here (the link expires in an hour):\n${url}\n\n` +
      `If that wasn't you, you can ignore this email.`,
  });
}
