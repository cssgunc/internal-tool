import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import React, { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import MeetingCheckinPage from "../src/app/checkin/[token]/page";
import {
  installDomShim,
  uninstallDomShim,
  mockFetch,
  restoreFetch,
  type SimpleElement,
} from "./dom-shim";

interface WindowWithTurnstile {
  turnstile?: {
    render: () => string;
    reset: () => void;
    remove: () => void;
  };
}

describe("Meeting Lookup 5-State Model (R3)", () => {
  let doc: ReturnType<typeof installDomShim>;
  let container: SimpleElement;
  let root: Root;

  beforeEach(() => {
    doc = installDomShim();
    container = doc.createElement("div");
    root = createRoot(container as unknown as HTMLElement);

    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: () => "widget-mock-id",
      reset: () => {},
      remove: () => {},
    };
  });

  afterEach(async () => {
    restoreFetch();
    await act(async () => {
      root.unmount();
    });
    uninstallDomShim();
  });

  async function renderPage(token: string) {
    await act(async () => {
      root.render(
        React.createElement(
          Suspense,
          { fallback: "Suspense fallback" },
          React.createElement(MeetingCheckinPage, {
            params: Promise.resolve({ token }),
          })
        )
      );
    });
  }

  it("state 1 & 2: displays accessible loading spinner, then transitions to HTTP 200 loaded state (R3)", async () => {
    let resolveFetch!: (res: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    mockFetch(async () => fetchPromise);

    // Start render with unresolved fetch
    await act(async () => {
      root.render(
        React.createElement(
          Suspense,
          { fallback: "Suspense fallback" },
          React.createElement(MeetingCheckinPage, {
            params: Promise.resolve({ token: "token-loading-test" }),
          })
        )
      );
    });

    // Verify accessible loading state
    const loadingStatus = container.querySelector(
      (n) => n.role === "status" && n.getAttribute("aria-live") === "polite"
    );
    expect(loadingStatus).not.toBeNull();
    expect(loadingStatus?.textContent).toContain("Loading meeting details...");

    // Now resolve the fetch with 200 OK
    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ title: "Spring General Body Meeting" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    // Check loaded state
    const heading = container.querySelector((n) => n.nodeName === "H1");
    expect(heading?.textContent).toBe("Spring General Body Meeting");

    // Form should be rendered
    const form = container.querySelector((n) => n.nodeName === "FORM");
    expect(form).not.toBeNull();
  });

  it("state 3: HTTP 404 renders 'Meeting Not Found' card with link to /checkin and NO retry button (R3)", async () => {
    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          error: { code: "NOT_FOUND", message: "Meeting not found" },
        }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        }
      );
    });

    await renderPage("invalid-token-404");

    const heading = container.querySelector((n) => n.nodeName === "H1");
    expect(heading?.textContent).toBe("Meeting Not Found");

    expect(container.textContent).toContain(
      "Meeting not found. This check-in link may be invalid or expired."
    );

    // Link to /checkin must be present
    const checkinLink = container.querySelector(
      (n) => n.nodeName === "A" && n.getAttribute("href") === "/checkin"
    );
    expect(checkinLink).not.toBeNull();
    expect(checkinLink?.textContent).toContain("Join the Interested List instead");

    // NO "Try Again" button for 404
    const tryAgainBtn = container.querySelector(
      (n) => n.nodeName === "BUTTON" && n.textContent.includes("Try Again")
    );
    expect(tryAgainBtn).toBeNull();
  });

  it("state 4: HTTP 500/503 renders 'Server Error' card with 'Try Again' retry button (R3)", async () => {
    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          error: { code: "INTERNAL", message: "Server error" },
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    });

    await renderPage("error-token-500");

    const heading = container.querySelector((n) => n.nodeName === "H1");
    expect(heading?.textContent).toBe("Server Error");

    expect(container.textContent).toContain(
      "A temporary server error occurred while loading meeting details. Please try again."
    );

    // "Try Again" button MUST be present
    const tryAgainBtn = container.querySelector(
      (n) => n.nodeName === "BUTTON" && n.textContent.includes("Try Again")
    );
    expect(tryAgainBtn).not.toBeNull();
  });

  it("state 5: network failure renders 'Connection Error' card with 'Try Again' button (R3)", async () => {
    mockFetch(async () => {
      throw new Error("Failed to fetch: DNS or network failure");
    });

    await renderPage("token-net-err");

    const heading = container.querySelector((n) => n.nodeName === "H1");
    expect(heading?.textContent).toBe("Connection Error");

    expect(container.textContent).toContain(
      "Unable to connect to the server. Please check your internet connection and try again."
    );

    const tryAgainBtn = container.querySelector(
      (n) => n.nodeName === "BUTTON" && n.textContent.includes("Try Again")
    );
    expect(tryAgainBtn).not.toBeNull();
  });

  it("clicking 'Try Again' re-fetches meeting details and recovers to loaded state on HTTP 200 (R3)", async () => {
    let callCount = 0;
    mockFetch(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response("Internal Error", { status: 500 });
      }
      return new Response(JSON.stringify({ title: "Recovered Meeting Title" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await renderPage("retry-test-token");

    // First attempt -> Server Error
    expect(container.textContent).toContain("Server Error");
    expect(callCount).toBe(1);

    // Click "Try Again"
    const tryAgainBtn = container.querySelector(
      (n) => n.nodeName === "BUTTON" && n.textContent.includes("Try Again")
    );
    await act(async () => {
      tryAgainBtn?.simulateClick();
    });

    // Should have refetched and recovered
    expect(callCount).toBe(2);
    expect(container.textContent).toContain("Recovered Meeting Title");
  });

  it("immediately transitions to loading state on token prop change, preventing stale data flash (R3)", async () => {
    let resolveTokenB!: (res: Response) => void;
    const tokenBPromise = new Promise<Response>((resolve) => {
      resolveTokenB = resolve;
    });

    mockFetch(async (url) => {
      if (String(url).includes("token-A")) {
        return new Response(JSON.stringify({ title: "Meeting A" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // token-B hangs until explicitly resolved
      return tokenBPromise;
    });

    // Load token-A
    await renderPage("token-A");
    expect(container.textContent).toContain("Meeting A");

    // Route changes to token-B
    await act(async () => {
      root.render(
        React.createElement(
          Suspense,
          { fallback: "Suspense fallback" },
          React.createElement(MeetingCheckinPage, {
            params: Promise.resolve({ token: "token-B" }),
          })
        )
      );
    });

    // Before token-B resolves: MUST NOT show Meeting A! Must be in loading state!
    expect(container.textContent).not.toContain("Meeting A");
    const loadingStatus = container.querySelector((n) => n.role === "status");
    expect(loadingStatus).not.toBeNull();
    expect(loadingStatus?.textContent).toContain("Loading meeting details...");

    // Now resolve token-B
    await act(async () => {
      resolveTokenB(
        new Response(JSON.stringify({ title: "Meeting B" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    expect(container.textContent).toContain("Meeting B");
  });

  it("ignores late responses from previous tokens if token changed or component unmounted (R3)", async () => {
    let resolveSlowFetch!: (res: Response) => void;
    const slowPromise = new Promise<Response>((resolve) => {
      resolveSlowFetch = resolve;
    });

    mockFetch(async (url) => {
      if (String(url).includes("slow-token")) {
        return slowPromise;
      }
      return new Response(JSON.stringify({ title: "Fast Meeting" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    // Mount slow token
    await act(async () => {
      root.render(
        React.createElement(
          Suspense,
          { fallback: "Suspense fallback" },
          React.createElement(MeetingCheckinPage, {
            params: Promise.resolve({ token: "slow-token" }),
          })
        )
      );
    });

    // Immediately switch to fast token
    await act(async () => {
      root.render(
        React.createElement(
          Suspense,
          { fallback: "Suspense fallback" },
          React.createElement(MeetingCheckinPage, {
            params: Promise.resolve({ token: "fast-token" }),
          })
        )
      );
    });

    // Fast token resolves
    expect(container.textContent).toContain("Fast Meeting");

    // Now slow token resolves late — it MUST NOT overwrite Fast Meeting
    await act(async () => {
      resolveSlowFetch(
        new Response(JSON.stringify({ title: "Stale Slow Meeting" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    expect(container.textContent).toContain("Fast Meeting");
    expect(container.textContent).not.toContain("Stale Slow Meeting");
  });
});
