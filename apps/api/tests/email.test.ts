import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { consoleService } from "../src/email/console";
import { sendEmail } from "../src/email/index";
import { sendPasswordResetEmail } from "../src/email/password-reset";
import type { EmailMessage, EmailService } from "../src/email/types";
import { envSchema } from "../src/env";

const message: EmailMessage = {
  to: "member@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
};

function fakeService(send: EmailService["send"]): EmailService & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(msg) {
      sent.push(msg);
      return send(msg);
    },
  };
}

describe("sendEmail", () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    log.mockClear();
    error.mockClear();
  });

  it("logs the email with the console provider instead of sending it", async () => {
    const result = await sendEmail(message, consoleService);

    expect(result).toEqual({ ok: true });
    expect(log).toHaveBeenCalledWith("[email:console]", message);
  });

  it("returns the provider's id on success", async () => {
    const service = fakeService(async () => ({ ok: true, id: "email_123" }));

    const result = await sendEmail(message, service);

    expect(result).toEqual({ ok: true, id: "email_123" });
    expect(service.sent).toEqual([message]);
    expect(error).not.toHaveBeenCalled();
  });

  it("logs and returns a provider error", async () => {
    const failure = { kind: "provider_error", message: "Invalid `to` field." } as const;
    const service = fakeService(async () => ({ ok: false, error: failure }));

    const result = await sendEmail(message, service);

    expect(result).toEqual({ ok: false, error: failure });
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("turns a thrown error into a typed provider error instead of throwing", async () => {
    const service = fakeService(async () => {
      throw new Error("network down");
    });

    const result = await sendEmail(message, service);

    expect(result).toEqual({
      ok: false,
      error: { kind: "provider_error", message: "Error: network down" },
    });
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe("sendPasswordResetEmail", () => {
  it("sends the reset link to the user, escaped in the HTML body", async () => {
    const sent: EmailMessage[] = [];
    const url = "https://admin.example.org/api/auth/reset-password/tok?callbackURL=/a&b=<c>";

    const result = await sendPasswordResetEmail(
      { user: { email: "member@example.com", name: "Ada" }, url },
      async (msg) => {
        sent.push(msg);
        return { ok: true };
      }
    );

    expect(result).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("member@example.com");
    expect(sent[0]!.text).toContain(url);
    expect(sent[0]!.html).toContain("callbackURL=/a&amp;b=&lt;c&gt;");
    expect(sent[0]!.html).not.toContain("<c>");
  });
});

describe("email environment", () => {
  it("defaults to the console provider outside production", () => {
    for (const NODE_ENV of [undefined, "development", "test"]) {
      expect(envSchema.parse({ NODE_ENV }).EMAIL_PROVIDER).toBe("console");
    }
  });

  it("defaults EMAIL_FROM to Resend's test sender", () => {
    expect(envSchema.parse({}).EMAIL_FROM).toBe("onboarding@resend.dev");
  });

  it("requires RESEND_API_KEY whenever the provider is resend", () => {
    const result = envSchema.safeParse({ EMAIL_PROVIDER: "resend" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toEqual(["RESEND_API_KEY"]);

    expect(
      envSchema.parse({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key" }).EMAIL_PROVIDER
    ).toBe("resend");
  });

  it("rejects blank email settings", () => {
    expect(envSchema.safeParse({ RESEND_API_KEY: "" }).success).toBe(false);
    expect(envSchema.safeParse({ EMAIL_FROM: " " }).success).toBe(false);
  });
});
