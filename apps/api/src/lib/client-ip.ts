import { isIP } from "node:net";
import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { env } from "../env";
import { ApiError } from "./errors";

/** Only Railway's public HTTP edge may supply X-Real-IP; see public-protection.md. */
export function clientIp(c: Context): string {
  let address: string | undefined;
  if (env.CLIENT_IP_SOURCE === "railway") {
    address = c.req.header("X-Real-IP");
  } else {
    try {
      address = getConnInfo(c).remote.address;
    } catch {
      // A synthetic request or unsupported runtime has no authenticated socket IP.
    }
  }
  if (!address || address.includes("%") || !isIP(address)) {
    throw new ApiError(400, "VALIDATION", "A valid client IP is required.");
  }
  if (isIP(address) === 4) return address;
  // Canonicalize IPv6 spellings, including IPv4-mapped IPv6, to one counter key.
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = Number.parseInt(mapped[1]!, 16);
  const low = Number.parseInt(mapped[2]!, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}
