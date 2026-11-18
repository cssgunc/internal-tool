import { z } from "zod";

/**
 * Add to public-form schemas. Any string passes validation so bots don't learn they were
 * caught; routes check `isHoneypotFilled` and fake success instead.
 */
export const honeypot = z.string().max(2048).optional();

/** True when a bot filled the honeypot: the route should return normal success and do nothing. */
export function isHoneypotFilled(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}
