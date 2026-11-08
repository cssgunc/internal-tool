import type { EmailService } from "./email-service";

export const consoleEmailService: EmailService = {
  async send(msg) {
    console.log("[email:console]", { to: msg.to, subject: msg.subject });
    console.log(msg.text ?? msg.html);
  },
};
