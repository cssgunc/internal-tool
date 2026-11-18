import { env } from "../env";
import { consoleService } from "./console";
import { createResendService } from "./resend";
import type { EmailMessage, EmailService, SendResult } from "./types";

const service: EmailService =
  env.EMAIL_PROVIDER === "resend"
    ? createResendService(env.RESEND_API_KEY!, env.EMAIL_FROM)
    : consoleService;

export async function sendEmail(msg: EmailMessage, svc = service): Promise<SendResult> {
  try {
    const result = await svc.send(msg);
    if (!result.ok) console.error("[email] send failed", result.error); // swap in your logger
    return result;
  } catch (e) {
    const error = { kind: "provider_error", message: String(e) } as const;
    console.error("[email] send threw", error);
    return { ok: false, error };
  }
}
