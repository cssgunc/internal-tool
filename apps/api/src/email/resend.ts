import { Resend } from "resend";
import type { EmailService } from "./types";

export function createResendService(apiKey: string, from: string): EmailService {
  const resend = new Resend(apiKey);
  return {
    async send({ to, subject, html, text }) {
      const { data, error } = await resend.emails.send({ from, to, subject, html, text });
      if (error) return { ok: false, error: { kind: "provider_error", message: error.message } };
      return { ok: true, id: data?.id };
    },
  };
}
