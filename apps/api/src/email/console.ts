import type { EmailService } from "./types";

export const consoleService: EmailService = {
  async send(msg) {
    console.log("[email:console]", msg);
    return { ok: true };
  },
};
