export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export type EmailError = { kind: "provider_error"; message: string };

export type SendResult = { ok: true; id?: string } | { ok: false; error: EmailError };

export interface EmailService {
  send(message: EmailMessage): Promise<SendResult>;
}
