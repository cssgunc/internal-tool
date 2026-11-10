// Sends one test email through whichever provider EMAIL_PROVIDER picks.
//
//   npm run email:test -- you@example.com
//
// With EMAIL_PROVIDER=console (the default outside production) the email is only
// logged. Set EMAIL_PROVIDER=resend and RESEND_API_KEY in .env to really send it.
// While EMAIL_FROM is Resend's test sender (onboarding@resend.dev), Resend only
// delivers to the address your Resend account is registered with.
import { z } from "zod";
import { env } from "../env";
import { sendEmail } from "../email/index";

async function main() {
  const to = process.argv[2];
  if (!to || !z.email().safeParse(to).success) {
    console.error("Usage: npm run email:test -- <email address>");
    process.exit(1);
  }

  console.log(
    `Sending a test email to ${to} via ${env.EMAIL_PROVIDER} (from ${env.EMAIL_FROM})...`
  );

  const sentAt = new Date().toISOString();
  const result = await sendEmail({
    to,
    subject: "CSSG test email",
    html: `<p>This is a test email from the CSSG API.</p><p>Sent at ${sentAt}.</p>`,
    text: `This is a test email from the CSSG API.\n\nSent at ${sentAt}.`,
  });

  if (!result.ok) {
    console.error("Send failed:", result.error);
    process.exit(1);
  }

  console.log("Sent.", result.id ? `Resend ID: ${result.id}` : "");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
