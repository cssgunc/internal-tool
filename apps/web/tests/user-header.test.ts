import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import type { Mock } from "bun:test";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockPush = mock();
const mockRefresh = mock();
let currentPathname = "/";
const stableRouter = {
  push: mockPush,
  refresh: mockRefresh,
};

mock.module("next/navigation", () => ({
  useRouter: () => stableRouter,
  usePathname: () => currentPathname,
}));

import { UserHeader } from "../src/components/UserHeader";

describe("UserHeader component", () => {
  let fetchSpy: Mock<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>;

  beforeEach(() => {
    mockPush.mockReset();
    mockRefresh.mockReset();
    currentPathname = "/";
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected fetch call"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("public route handling (avoids unnecessary authentication requests)", () => {
    it.each([
      ["/sign-in"],
      ["/set-password"],
      ["/set-password?token=abc"],
      ["/checkin"],
      ["/checkin/meeting-123"],
    ])("renders null and does not fetch /api/v1/me on public route %s", (path) => {
      currentPathname = path;
      const { container } = render(React.createElement(UserHeader));

      expect(container.firstChild).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("protected route authentication and display", () => {
    it("fetches user info and displays the user name on protected routes", async () => {
      currentPathname = "/semesters";
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({ id: "user-1", email: "jane@example.com", name: "Jane Doe" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      render(React.createElement(UserHeader));

      // Initially shows loading
      expect(screen.getByRole("status")).toBeTruthy();

      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeTruthy();
        expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy();
        expect(screen.getByRole("link", { name: "CSSG Internal Tool" })).toBeTruthy();
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const call = fetchSpy.mock.calls[0];
      expect(call).toBeDefined();
      const [url, options] = call!;
      expect(url).toBe("/api/v1/me");
      expect(options?.credentials).toBe("same-origin");
    });

    it("redirects to /sign-in when /api/v1/me returns 401 unauthorized", async () => {
      currentPathname = "/";
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      render(React.createElement(UserHeader));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/sign-in");
        expect(mockRefresh).toHaveBeenCalledTimes(1);
      });

      expect(screen.queryByText(/sign out/i)).toBeNull();
    });

    it("displays error state on network failure and recovers on retry", async () => {
      currentPathname = "/";
      fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      render(React.createElement(UserHeader));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Network error loading user information.");
      const retryButton = screen.getByRole("button", { name: /retry/i });
      expect(retryButton).toBeTruthy();

      // Setup success for retry
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "user-1", email: "jane@example.com", name: "Jane Doe" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
      });
    });
  });

  describe("sign-out flow", () => {
    it("calls POST /api/auth/sign-out, clears user name immediately, and navigates to /sign-in", async () => {
      currentPathname = "/";
      // First call: GET /api/v1/me
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "user-1", email: "jane@example.com", name: "Jane Doe" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

      render(React.createElement(UserHeader));

      const signOutButton = await screen.findByRole("button", { name: /sign out/i });
      expect(screen.getByText("Jane Doe")).toBeTruthy();

      // Second call: POST /api/auth/sign-out
      let resolveSignOut: (value: Response) => void;
      fetchSpy.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSignOut = resolve;
        })
      );

      fireEvent.click(signOutButton);

      // Verify sign out in progress: button disabled and labeled "Signing out..."
      const inProgressBtn = screen.getByRole("button", {
        name: /signing out\.\.\./i,
      }) as HTMLButtonElement;
      expect(inProgressBtn.disabled).toBe(true);

      // Complete sign-out request
      resolveSignOut!(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await waitFor(() => {
        // User name should be cleared immediately (no stale user name display)
        expect(screen.queryByText("Jane Doe")).toBeNull();
        expect(mockPush).toHaveBeenCalledWith("/sign-in");
        expect(mockRefresh).toHaveBeenCalledTimes(1);
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const call = fetchSpy.mock.calls[1];
      expect(call).toBeDefined();
      const [url, options] = call!;
      expect(url).toBe("/api/auth/sign-out");
      expect(options?.method).toBe("POST");
      expect(options?.credentials).toBe("same-origin");
    });
  });
});
