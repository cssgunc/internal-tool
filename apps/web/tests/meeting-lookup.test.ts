import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import type { Mock } from "bun:test";
import React, { Suspense } from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import MeetingCheckinPage from "../src/app/checkin/[token]/page";

interface WindowWithTurnstile {
  turnstile?: {
    render: () => string;
    reset: () => void;
    remove: () => void;
  };
}

describe("Meeting lookup states and error recovery", () => {
  let fetchSpy: Mock<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected API request"));
    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: () => "widget-mock-id",
      reset: () => {},
      remove: () => {},
    };
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function renderPage(token: string) {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        React.createElement(
          Suspense,
          { fallback: "Suspense fallback" },
          React.createElement(MeetingCheckinPage, {
            params: Promise.resolve({ token }),
          })
        )
      );
    });
    return result!;
  }

  it("displays accessible loading spinner, then transitions to HTTP 200 loaded state", async () => {
    let resolveFetch!: (res: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    fetchSpy.mockImplementation(() => fetchPromise);

    await act(async () => {
      render(
        React.createElement(
          Suspense,
          { fallback: "Suspense fallback" },
          React.createElement(MeetingCheckinPage, {
            params: Promise.resolve({ token: "token-loading-test" }),
          })
        )
      );
    });

    const loadingStatus = screen.getByRole("status");
    expect(loadingStatus).toBeTruthy();
    expect(loadingStatus.textContent).toContain("Loading meeting details...");

    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ title: "Spring General Body Meeting" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Spring General Body Meeting"
    );
    expect(screen.getByLabelText(/first name/i)).toBeTruthy();
  });

  it("HTTP 404 renders 'Meeting Not Found' card with link to /checkin and NO retry button", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: "NOT_FOUND", message: "Meeting not found." },
          }),
          { status: 404, headers: { "content-type": "application/json" } }
        )
      )
    );

    await renderPage("unknown-meeting-token");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Meeting Not Found" })).toBeTruthy();
    });

    expect(screen.getByText(/this check-in link may be invalid/i)).toBeTruthy();

    const checkinLink = screen.getByRole("link", { name: /join the interested list instead/i });
    expect(checkinLink).toBeTruthy();
    expect(checkinLink.getAttribute("href")).toBe("/checkin");

    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("HTTP 500/503 renders 'Server Error' card with 'Try Again' retry button", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: "INTERNAL_ERROR", message: "Internal server error" },
          }),
          { status: 500, headers: { "content-type": "application/json" } }
        )
      )
    );

    await renderPage("server-error-token");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Server Error" })).toBeTruthy();
    });

    expect(screen.getByText(/a temporary server error occurred/i)).toBeTruthy();

    const tryAgainBtn = screen.getByRole("button", { name: /try again/i });
    expect(tryAgainBtn).toBeTruthy();
  });

  it("network failure renders 'Connection Error' card with 'Try Again' button", async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));

    await renderPage("network-error-token");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Connection Error" })).toBeTruthy();
    });

    expect(screen.getByText(/unable to connect to the server/i)).toBeTruthy();

    const tryAgainBtn = screen.getByRole("button", { name: /try again/i });
    expect(tryAgainBtn).toBeTruthy();
  });

  it("clicking 'Try Again' re-fetches meeting details and recovers to loaded state on HTTP 200", async () => {
    let callCount = 0;
    fetchSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Boom" } }), {
            status: 500,
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ title: "Recovered Meeting Title" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    await renderPage("retry-recovery-token");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Server Error" })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Recovered Meeting Title" })
      ).toBeTruthy();
    });
  });

  it("immediately transitions to loading state on token prop change, preventing stale data flash", async () => {
    fetchSpy.mockImplementation((url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("token-a")) {
        return Promise.resolve(
          new Response(JSON.stringify({ title: "Meeting Alpha" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      }
      // Never resolving for token-b to check loading state
      return new Promise(() => {});
    });

    const { rerender } = await renderPage("token-a");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Meeting Alpha" })).toBeTruthy();
    });

    // Rerender with token-b
    await act(async () => {
      rerender(
        React.createElement(
          Suspense,
          { fallback: "Suspense fallback" },
          React.createElement(MeetingCheckinPage, {
            params: Promise.resolve({ token: "token-b" }),
          })
        )
      );
    });

    // Immediately shows loading status without flashing Meeting Alpha
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("Meeting Alpha")).toBeNull();
  });

  it("ignores late responses from previous tokens", async () => {
    let resolveToken1!: (res: Response) => void;
    const token1Promise = new Promise<Response>((resolve) => {
      resolveToken1 = resolve;
    });

    fetchSpy.mockImplementation((url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("token-1")) {
        return token1Promise;
      }
      return Promise.resolve(
        new Response(JSON.stringify({ title: "Meeting 2 Title" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    const { rerender } = await renderPage("token-1");

    // Token 1 is loading
    expect(screen.getByRole("status")).toBeTruthy();

    // Change to token 2
    await act(async () => {
      rerender(
        React.createElement(
          Suspense,
          { fallback: "Suspense fallback" },
          React.createElement(MeetingCheckinPage, {
            params: Promise.resolve({ token: "token-2" }),
          })
        )
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Meeting 2 Title" })).toBeTruthy();
    });

    // Now resolve token 1 late
    await act(async () => {
      resolveToken1(
        new Response(JSON.stringify({ title: "Stale Token 1 Title" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    // Content should remain Meeting 2 Title, not Stale Token 1 Title
    expect(screen.getByRole("heading", { level: 1, name: "Meeting 2 Title" })).toBeTruthy();
    expect(screen.queryByText("Stale Token 1 Title")).toBeNull();
  });
});
