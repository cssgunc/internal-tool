# Public form protections

These helpers are deliberately not mounted on the production app. Future public
routes should create their limiter once, outside the handler, then validate the
shared form schema, then verify Turnstile before any side effect:

```ts
// packages/shared: add these fields to the future form's Zod schema.
import { honeypot } from "@internal-tool/shared";
// z.object({ ..., website: honeypot, turnstileToken: z.string() })

// apps/api: imports relative to src/routes/.
import { rateLimit } from "../lib/rate-limit";
import { verifyTurnstile } from "../lib/turnstile";
import { validate } from "../lib/validation";

// formSchema comes from @internal-tool/shared; submit handles the validated form.
routes.post(
  "/",
  rateLimit({ windowMs: 60_000, max: 10 }),
  validate("json", formSchema),
  verifyTurnstile,
  submit
);
```

The honeypot field must be omitted or exactly empty (including no whitespace).
The future UI should hide it from people and assistive technology, and disable
autofill. It is a spam signal, not an authentication mechanism. Malformed bodies
and honeypot values use the existing `VALIDATION` envelope with field errors.

`verifyTurnstile` reads JSON `turnstileToken` from Hono's cached body and calls
Cloudflare Siteverify on every submission. Missing, blank, oversized, rejected,
expired or reused tokens produce 400 `VALIDATION` with a `turnstileToken` field
error. Only literal `success: true` in a successful HTTP response passes. Network
errors, timeouts (5 seconds), redirects, non-2xx responses, and malformed provider
responses fail closed with the same error; provider details and secrets are not
returned. `remoteip` is optional and intentionally omitted. Configure allowed
production hostnames in Cloudflare; future route-specific action/hostname checks
can be added if forms need stronger token scoping.

## Environment

Development and tests default to Cloudflare's official always-pass **test** secret.
The devcontainer, CI, and `.env.example` also set it explicitly. A future development
widget can use sitekey `1x00000000000000000000AA`. All Siteverify calls in unit tests
are mocked, so no external provider is needed.

Production must set `NODE_ENV=production` and a real `TURNSTILE_SECRET_KEY` in
Railway's environment. Startup validation rejects missing/blank secrets and the
published dummy secret/site keys, including the always-pass test secret. Never
copy the development secret into production or put a real secret in web variables.
The server cannot infer whether a non-dummy key is valid until Siteverify responds.

See Cloudflare's [testing credentials](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
and [Siteverify contract](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Client IP trust boundary

`CLIENT_IP_SOURCE=socket` is the default. It uses Bun's `server.requestIP` through
Hono's Bun adapter and ignores **all** forwarding headers, including `X-Real-IP`.
This handles direct/local/private callers without trusting client-supplied headers.
Bun passes its server as the second argument to the exported fetch handler.

Set `CLIENT_IP_SOURCE=railway` only for a deployment whose untrusted HTTP traffic
enters through Railway's public HTTP edge. Railway's
[public networking specifications](https://docs.railway.com/networking/public-networking/specs-and-limits)
identify `X-Real-IP` as the client's remote IP. Its
[trust-semantics clarification](https://station.railway.com/questions/security-clarification-x-forwarded-for-fb0bba28)
states that the edge overwrites client-supplied `X-Real-IP` for both Railway and
custom domains. That clarification is a Railway bot response, so the documented
header contract and the deployment boundary remain the basis of this design.
The helper reads only this single header, never `X-Forwarded-For`, `Forwarded`,
`CF-Connecting-IP`, a client-supplied host, or an arbitrary hop count.

**Railway mode does not authenticate the immediate peer.** Private-network and TCP
proxy traffic bypass the public HTTP edge. Every service/person able to reach the
listener through those paths must be trusted; otherwise leave socket mode enabled
or isolate/authenticate ingress before enabling public form routes. A forged
`X-Real-IP` from a private caller is indistinguishable from the edge's header.
Neither a private socket address nor another Railway-looking header proves edge
provenance, and Railway does not publish stable proxy CIDRs for a peer allowlist.
Do not expose a TCP proxy to this listener or treat private-network reachability
as proof of trusted forwarding. Adding a CDN requires revisiting the trust chain.

In both modes, missing/unavailable/malformed addresses return 400 `VALIDATION`:
there is no attacker-selected forwarded fallback or unlimited bypass. Only one
IPv4/IPv6 literal is accepted; lists, ports, bracketed literals and zone IDs are
rejected. IPv6 and IPv4-mapped IPv6 spellings are normalized before counting.
IP addresses remain a coarse abuse signal: NAT can group people together and VPNs
or IPv6 address rotation can give one person multiple identities.

## Limiter lifecycle

`rateLimit({ windowMs, max })` requires positive safe integers and allows `max`
requests per IP per fixed window, starting with that IP's first request. It uses
a monotonic clock. Rejected requests do not extend the window. Limit responses
use 429 `RATE_LIMITED` and `Retry-After` in whole seconds rounded up to expiry.
Downstream validation failures still consume a request.

Each middleware instance owns its counters. Reuse an instance to share a budget
between routes; create separate instances for separate budgets. Expired entries
are pruned on subsequent requests, and the map is capped at 10,000 active IPs.
At capacity, new IPs receive 429 until the earliest window expires; active counters
are never evicted to make room. Idle maps remain bounded without background timers.

Counters are in-memory, **reset on every deploy/restart**, and are not shared
between processes or replicas. This is intended for the current single API
instance. Multiple replicas require shared storage before these limits can serve
as a global budget. Fixed windows permit bursts near a window boundary.

## TDD follow-up

The lead should remove the implemented ‼️ markers in TDD 2.3 (Shared Form Behavior)
and TDD 3 (Public Forms & Spam Protection), linked from issue #18. Note that these
are reusable primitives only: public-route wiring and UI fields are future work.
The Notion Tickets board Owner also needs updating; the GitHub issue is self-assigned.
