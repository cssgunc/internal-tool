import { db } from "./index";
import { emailTemplates } from "./schema";

const defaultTemplates = [
  {
    kind: "invite" as const,
    subject: "Welcome to CSSG!",
    body: "Hi {{firstName}},\n\nWelcome to CSSG! Visit {{siteUrl}} to get started.",
  },
  {
    kind: "password_reset" as const,
    subject: "Reset your CSSG password",
    body: "Hi {{firstName}},\n\nReset your password here: {{resetUrl}}",
  },
  {
    kind: "applications_open" as const,
    subject: "CSSG Applications Are Open!",
    body: "Hi {{firstName}},\n\nApplications are now open! Apply at {{siteUrl}}",
  },
  {
    kind: "closing_reminder" as const,
    subject: "CSSG Applications Close Soon",
    body: "Hi {{firstName}},\n\nApplications close on {{closingDate}}. Apply at {{siteUrl}}",
  },
  {
    kind: "exec_rejection" as const,
    subject: "CSSG Executive Application Update",
    body: "Hi {{firstName}},\n\nThank you for applying. Unfortunately, you were not selected for an executive position.",
  },
  {
    kind: "returner_congrats" as const,
    subject: "Welcome Back to CSSG!",
    body: "Hi {{firstName}},\n\nWelcome back! You've been assigned to {{projectName}}.",
  },
  {
    kind: "education_congrats" as const,
    subject: "Welcome to CSSG Education!",
    body: "Hi {{firstName}},\n\nCongratulations on joining the Education Team!",
  },
  {
    kind: "rejection" as const,
    subject: "CSSG Application Update",
    body: "Hi {{firstName}},\n\nThank you for applying. Unfortunately, we cannot offer you a position this semester.",
  },
];

async function seedEmailTemplates() {
  await db
    .insert(emailTemplates)
    .values(defaultTemplates)
    .onConflictDoNothing({ target: emailTemplates.kind });

  console.log("Email templates seeded successfully!");
}

await seedEmailTemplates();
