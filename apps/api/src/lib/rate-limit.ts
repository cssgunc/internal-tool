import type { MiddlewareHandler } from "hono";
import { clientIp } from "./client-ip";
import { errorResponse } from "./errors";

/** Fixed windows, scoped to this instance. Counts requests before downstream validation. */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }): MiddlewareHandler {
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0 || !Number.isSafeInteger(max) || max <= 0) {
    throw new RangeError("windowMs and max must be positive safe integers.");
  }
  const counters = new Map<string, { count: number; expiresAt: number }>();
  // Bound memory even under many distinct IPs; never evict an active counter.
  const capacity = 10_000;
  return async (c, next) => {
    const ip = clientIp(c);
    const now = performance.now();
    // Insertion order is expiration order. No timer or full-map scan is needed.
    for (const [key, counter] of counters) {
      if (counter.expiresAt > now) break;
      counters.delete(key);
    }
    let counter = counters.get(ip);
    if (!counter && counters.size < capacity) {
      counter = { count: 0, expiresAt: now + windowMs };
      counters.set(ip, counter);
    }
    if (!counter || counter.count >= max) {
      const expiresAt = counter?.expiresAt ?? counters.values().next().value!.expiresAt;
      c.header("Retry-After", String(Math.max(1, Math.ceil((expiresAt - now) / 1000))));
      return c.json(errorResponse("RATE_LIMITED", "Too many requests."), 429);
    }
    counter.count++;
    await next();
  };
}
