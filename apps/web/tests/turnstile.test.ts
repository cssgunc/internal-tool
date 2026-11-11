import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Turnstile, type TurnstileRef } from "../src/components/Turnstile";

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

function setNodeEnv(val: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (val !== undefined) {
    env["NODE_ENV"] = val;
  } else {
    delete env["NODE_ENV"];
  }
}

describe("Turnstile Component", () => {
  let originalNodeEnv: string | undefined;
  let originalSiteKey: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  });

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
    if (originalSiteKey !== undefined) {
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalSiteKey;
    } else {
      delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    }
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

    const first = render(
      React.createElement(Turnstile, {
        onSuccess: () => {},
      })
    );

    const script = document.getElementById(
      "cloudflare-turnstile-script"
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script?.src).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    );

    // Simulate script load event
    await act(async () => {
      fireEvent.load(script!);
    });

    expect(renderCalls).toBe(1);
    const second = render(React.createElement(Turnstile, { onSuccess: () => {} }));
    expect(
      document.querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]')
    ).toHaveLength(1);
    expect(renderCalls).toBe(2);
    first.unmount();
    second.unmount();
  });

  it("keeps the widget mounted and uses the latest success callback after rerender", async () => {
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
    const { rerender } = render(
      React.createElement(Turnstile, {
        onSuccess: () => {
          callback1Fired = true;
        },
      })
    );

    const script = document.getElementById(
      "cloudflare-turnstile-script"
    ) as HTMLScriptElement | null;
    await act(async () => {
      fireEvent.load(script!);
    });

    expect(renderCalls).toBe(1);

    // Re-render with new callback identity
    rerender(
      React.createElement(Turnstile, {
        onSuccess: () => {
          callback2Fired = true;
        },
      })
    );

    // Widget must NOT be rendered again
    expect(renderCalls).toBe(1);

    // Invoking the callback must call the updated callback 2 via the ref
    (storedParams as TurnstileMockParams | null)?.callback?.("dummy-token");
    expect(callback1Fired).toBe(false);
    expect(callback2Fired).toBe(true);
  });

  it("exposes an imperative reset() handle calling window.turnstile.reset", async () => {
    let resetWidgetId = "";
    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: () => "widget-xyz",
      reset: (id) => {
        resetWidgetId = id;
      },
      remove: () => {},
    };

    const turnstileRef = React.createRef<TurnstileRef>();

    render(
      React.createElement(Turnstile, {
        ref: turnstileRef,
        onSuccess: () => {},
      })
    );

    const script = document.getElementById(
      "cloudflare-turnstile-script"
    ) as HTMLScriptElement | null;
    await act(async () => {
      fireEvent.load(script!);
    });

    expect(turnstileRef.current).not.toBeNull();
    turnstileRef.current?.reset();

    expect(resetWidgetId).toBe("widget-xyz");
  });

  it("uses updated expiry and error callbacks without recreating the widget", async () => {
    const originalError = () => {
      throw new Error("Stale error callback");
    };
    const originalExpiry = () => {
      throw new Error("Stale expiry callback");
    };
    let params!: TurnstileMockParams;
    let renders = 0;
    let errors = 0;
    let expirations = 0;
    window.turnstile = {
      render: (_container, callbacks) => {
        renders++;
        params = callbacks;
        return "widget";
      },
      reset: () => {},
      remove: () => {},
    };
    const { rerender, unmount } = render(
      React.createElement(Turnstile, {
        onSuccess: () => {},
        onError: originalError,
        onExpire: originalExpiry,
      })
    );
    await act(async () => {
      fireEvent.load(document.getElementById("cloudflare-turnstile-script")!);
    });
    rerender(
      React.createElement(Turnstile, {
        onSuccess: () => {},
        onError: () => {
          errors++;
        },
        onExpire: () => {
          expirations++;
        },
      })
    );
    act(() => {
      params["error-callback"]?.();
      params["expired-callback"]?.();
    });
    expect(renders).toBe(1);
    expect(errors).toBe(1);
    expect(expirations).toBe(1);
    unmount();
    act(() => {
      params["error-callback"]?.();
      params["expired-callback"]?.();
    });
    expect(errors).toBe(1);
    expect(expirations).toBe(1);
  });

  it("removes the rendered widget on unmount", async () => {
    let removedWidgetId = "";
    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: () => "widget-to-remove",
      reset: () => {},
      remove: (id) => {
        removedWidgetId = id;
      },
    };

    const { unmount } = render(
      React.createElement(Turnstile, {
        onSuccess: () => {},
      })
    );

    const script = document.getElementById(
      "cloudflare-turnstile-script"
    ) as HTMLScriptElement | null;
    await act(async () => {
      fireEvent.load(script!);
    });

    // Unmount
    unmount();

    expect(removedWidgetId).toBe("widget-to-remove");
  });

  it("handles script loading error and invokes onError", async () => {
    let errorFired = false;

    render(
      React.createElement(Turnstile, {
        onSuccess: () => {},
        onError: () => {
          errorFired = true;
        },
      })
    );

    const script = document.getElementById(
      "cloudflare-turnstile-script"
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();

    await act(async () => {
      fireEvent.error(script!);
    });

    expect(errorFired).toBe(true);
  });

  it("stops pending script listeners when unmounted before the script loads", () => {
    let errors = 0;
    let widgets = 0;
    delete window.turnstile;
    const { unmount } = render(
      React.createElement(Turnstile, {
        onSuccess: () => {},
        onError: () => {
          errors++;
        },
      })
    );
    const script = document.getElementById("cloudflare-turnstile-script")!;
    unmount();
    window.turnstile = {
      render: () => {
        widgets++;
        return "widget";
      },
      reset: () => {},
      remove: () => {},
    };
    fireEvent.load(script);
    fireEvent.error(script);
    expect(widgets).toBe(0);
    expect(errors).toBe(0);
  });

  it("falls back to the default test key in dev/test environment", async () => {
    const prevSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const prevNodeEnv = process.env.NODE_ENV;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    setNodeEnv("test");

    try {
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

      render(
        React.createElement(Turnstile, {
          onSuccess: () => {},
        })
      );

      const script = document.getElementById(
        "cloudflare-turnstile-script"
      ) as HTMLScriptElement | null;
      await act(async () => {
        fireEvent.load(script!);
      });

      expect(renderedSiteKey).toBe("1x00000000000000000000AA");
    } finally {
      if (prevSiteKey !== undefined) {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = prevSiteKey;
      } else {
        delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      }
      setNodeEnv(prevNodeEnv);
    }
  });

  it("in production, missing NEXT_PUBLIC_TURNSTILE_SITE_KEY renders role='alert' and halts script loading", async () => {
    const prevSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const prevNodeEnv = process.env.NODE_ENV;
    setNodeEnv("production");
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    try {
      render(
        React.createElement(Turnstile, {
          onSuccess: () => {},
        })
      );

      // Script should NOT be created
      const script = document.getElementById("cloudflare-turnstile-script");
      expect(script).toBeNull();

      // Alert banner should be rendered
      const alertEl = screen.getByRole("alert");
      expect(alertEl).not.toBeNull();
      expect(alertEl.textContent).toContain(
        "Verification is temporarily unavailable. Please contact the administrator."
      );
    } finally {
      if (prevSiteKey !== undefined) {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = prevSiteKey;
      } else {
        delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      }
      setNodeEnv(prevNodeEnv);
    }
  });

  it("in production, provided NEXT_PUBLIC_TURNSTILE_SITE_KEY is used properly without alert banner", async () => {
    const prevSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const prevNodeEnv = process.env.NODE_ENV;
    setNodeEnv("production");
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAAPROD_KEY";

    try {
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

      render(
        React.createElement(Turnstile, {
          onSuccess: () => {},
        })
      );

      const script = document.getElementById(
        "cloudflare-turnstile-script"
      ) as HTMLScriptElement | null;
      expect(script).not.toBeNull();

      await act(async () => {
        fireEvent.load(script!);
      });

      expect(renderedSiteKey).toBe("0x4AAAAAAAPROD_KEY");
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      if (prevSiteKey !== undefined) {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = prevSiteKey;
      } else {
        delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      }
      setNodeEnv(prevNodeEnv);
    }
  });
});
