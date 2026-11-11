import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Turnstile, type TurnstileRef } from "../src/components/Turnstile";
import { installDomShim, uninstallDomShim, type SimpleElement } from "./dom-shim";

interface TurnstileMockParams {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
}

interface WindowWithTurnstile {
  turnstile?: {
    render: (container: unknown, params: TurnstileMockParams) => string;
    reset: (widgetId: string) => void;
    remove: (widgetId: string) => void;
  };
}

describe("Turnstile Component (R1 & R6)", () => {
  let doc: ReturnType<typeof installDomShim>;
  let container: SimpleElement;
  let root: Root;
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
    doc = installDomShim();
    container = doc.createElement("div");
    root = createRoot(container as unknown as HTMLElement);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    uninstallDomShim();
    process.env = originalEnv;
  });

  it("loads the Cloudflare Turnstile script exactly once and renders the widget", async () => {
    let renderCalls = 0;
    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: () => {
        renderCalls++;
        return "widget-123";
      },
      reset: () => {},
      remove: () => {},
    };

    const turnstileRef = React.createRef<TurnstileRef>();

    await act(async () => {
      root.render(
        React.createElement(Turnstile, {
          ref: turnstileRef,
          onSuccess: () => {},
        })
      );
    });

    const script = doc.getElementById("cloudflare-turnstile-script");
    expect(script).not.toBeNull();
    expect(script?.src).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    );

    // Simulate script load event
    await act(async () => {
      script?.dispatchEvent({ type: "load" });
    });

    expect(renderCalls).toBe(1);
  });

  it("stores callbacks in refs and does NOT recreate widget on re-render with new callback identities (R1)", async () => {
    let renderCalls = 0;
    let storedParams: TurnstileMockParams | null = null;

    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: (_c, params) => {
        renderCalls++;
        storedParams = params;
        return "widget-abc";
      },
      reset: () => {},
      remove: () => {},
    };

    let callback1Fired = false;
    let callback2Fired = false;

    // First render with callback 1
    await act(async () => {
      root.render(
        React.createElement(Turnstile, {
          onSuccess: () => {
            callback1Fired = true;
          },
        })
      );
    });

    const script = doc.getElementById("cloudflare-turnstile-script");
    await act(async () => {
      script?.dispatchEvent({ type: "load" });
    });

    expect(renderCalls).toBe(1);

    // Re-render with callback 2 (simulating parent state change, e.g. typing in input)
    await act(async () => {
      root.render(
        React.createElement(Turnstile, {
          onSuccess: () => {
            callback2Fired = true;
          },
        })
      );
    });

    // Re-render MUST NOT re-call render
    expect(renderCalls).toBe(1);

    // Trigger callback from widget — it should call callback 2 via ref
    (storedParams as TurnstileMockParams | null)?.callback?.("verified-token");
    expect(callback1Fired).toBe(false);
    expect(callback2Fired).toBe(true);
  });

  it("exposes imperative reset() handle calling window.turnstile.reset (R2)", async () => {
    let resetCalls = 0;
    let resetWidgetId = "";

    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: () => "widget-to-reset",
      reset: (id: string) => {
        resetCalls++;
        resetWidgetId = id;
      },
      remove: () => {},
    };

    const turnstileRef = React.createRef<TurnstileRef>();

    await act(async () => {
      root.render(
        React.createElement(Turnstile, {
          ref: turnstileRef,
          onSuccess: () => {},
        })
      );
    });

    const script = doc.getElementById("cloudflare-turnstile-script");
    await act(async () => {
      script?.dispatchEvent({ type: "load" });
    });

    expect(turnstileRef.current).not.toBeNull();
    turnstileRef.current?.reset();

    expect(resetCalls).toBe(1);
    expect(resetWidgetId).toBe("widget-to-reset");
  });

  it("cleans up event listeners and removes widget from window.turnstile on unmount (R1)", async () => {
    let removeCalls = 0;
    let removedWidgetId = "";

    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: () => "widget-to-remove",
      reset: () => {},
      remove: (id: string) => {
        removeCalls++;
        removedWidgetId = id;
      },
    };

    await act(async () => {
      root.render(
        React.createElement(Turnstile, {
          onSuccess: () => {},
        })
      );
    });

    const script = doc.getElementById("cloudflare-turnstile-script");
    await act(async () => {
      script?.dispatchEvent({ type: "load" });
    });

    // Unmount
    await act(async () => {
      root.unmount();
    });

    expect(removeCalls).toBe(1);
    expect(removedWidgetId).toBe("widget-to-remove");
  });

  it("handles script loading error and invokes onError (R1)", async () => {
    let errorFired = false;

    await act(async () => {
      root.render(
        React.createElement(Turnstile, {
          onSuccess: () => {},
          onError: () => {
            errorFired = true;
          },
        })
      );
    });

    const script = doc.getElementById("cloudflare-turnstile-script");
    expect(script).not.toBeNull();

    await act(async () => {
      script?.dispatchEvent({ type: "error" });
    });

    expect(errorFired).toBe(true);
  });

  it("falls back to the default test key in dev/test environment (R6)", async () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "test",
      configurable: true,
      writable: true,
    });

    let renderedSiteKey = "";
    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: (_c, params) => {
        renderedSiteKey = params.sitekey;
        return "widget-dev";
      },
      reset: () => {},
      remove: () => {},
    };

    await act(async () => {
      root.render(
        React.createElement(Turnstile, {
          onSuccess: () => {},
        })
      );
    });

    const script = doc.getElementById("cloudflare-turnstile-script");
    await act(async () => {
      script?.dispatchEvent({ type: "load" });
    });

    expect(renderedSiteKey).toBe("1x00000000000000000000AA");
  });

  it("in production, missing NEXT_PUBLIC_TURNSTILE_SITE_KEY renders role='alert' and halts script loading (R6)", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      writable: true,
    });
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    await act(async () => {
      root.render(
        React.createElement(Turnstile, {
          onSuccess: () => {},
        })
      );
    });

    // Script should NOT be created
    const script = doc.getElementById("cloudflare-turnstile-script");
    expect(script).toBeNull();

    // Alert banner should be rendered
    const alertEl = container.querySelector(
      (n) => n.role === "alert" || n.textContent.includes("Verification is temporarily unavailable")
    );
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain(
      "Verification is temporarily unavailable. Please contact the administrator."
    );
  });

  it("in production, provided NEXT_PUBLIC_TURNSTILE_SITE_KEY is used properly without alert banner (R6)", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      writable: true,
    });
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAAPROD_KEY";

    let renderedSiteKey = "";
    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: (_c, params) => {
        renderedSiteKey = params.sitekey;
        return "widget-prod";
      },
      reset: () => {},
      remove: () => {},
    };

    await act(async () => {
      root.render(
        React.createElement(Turnstile, {
          onSuccess: () => {},
        })
      );
    });

    const script = doc.getElementById("cloudflare-turnstile-script");
    expect(script).not.toBeNull();

    await act(async () => {
      script?.dispatchEvent({ type: "load" });
    });

    expect(renderedSiteKey).toBe("0x4AAAAAAAPROD_KEY");

    const alertEl = container.querySelector((n) => n.role === "alert");
    expect(alertEl).toBeNull();
  });
});
