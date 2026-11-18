import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import type { Mock } from "bun:test";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockPush = mock();
const mockRefresh = mock();
let currentSearchParams = new URLSearchParams();

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => currentSearchParams,
}));

// Import after mocking next/navigation
import { SetPasswordForm } from "../src/components/SetPasswordForm";
import SetPasswordPage from "../src/app/set-password/page";

describe("SetPasswordForm and /set-password page", () => {
  let fetchSpy: Mock<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>;

  beforeEach(() => {
    mockPush.mockReset();
    mockRefresh.mockReset();
    currentSearchParams = new URLSearchParams();
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected fetch call"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("renders missing token error when token query parameter is absent", () => {
    currentSearchParams = new URLSearchParams();

    render(React.createElement(SetPasswordPage));

    expect(screen.getByRole("heading", { name: "CSSG Internal Tool" })).toBeTruthy();
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain("Missing setup token");
    expect(screen.getByRole("link", { name: /back to sign in/i })).toBeTruthy();
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it("renders missing token error when token is blank whitespace", () => {
    currentSearchParams = new URLSearchParams("token=   ");

    render(React.createElement(SetPasswordForm));

    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain("Missing setup token");
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it("renders form inputs when a token is provided", () => {
    currentSearchParams = new URLSearchParams("token=valid-secret-token");

    render(React.createElement(SetPasswordPage));

    expect(screen.getByLabelText(/^new password/i)).toBeTruthy();
    expect(screen.getByLabelText(/confirm password/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /set password/i })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("validates that password must be at least 8 characters long before submitting", async () => {
    currentSearchParams = new URLSearchParams("token=valid-secret-token");

    render(React.createElement(SetPasswordForm));

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "short" },
    });
    const form = screen.getByRole("button", { name: /set password/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Password must be at least 8 characters long.");
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("validates that passwords must match before submitting", async () => {
    currentSearchParams = new URLSearchParams("token=valid-secret-token");

    render(React.createElement(SetPasswordForm));

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "supersecret123" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "mismatchpass456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Passwords do not match.");
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("successfully sets password and displays confirmation with sign-in link", async () => {
    currentSearchParams = new URLSearchParams("token=valid-token-xyz");

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const onSuccess = mock();
    render(React.createElement(SetPasswordForm, { onSuccess }));

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "newPassword123" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "newPassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const call = fetchSpy.mock.calls[0];
    expect(call).toBeDefined();
    const [url, options] = call!;
    expect(url).toBe("/api/auth/reset-password");
    expect(options?.method).toBe("POST");
    expect(options?.credentials).toBe("same-origin");
    expect(JSON.parse(options?.body as string)).toEqual({
      newPassword: "newPassword123",
      token: "valid-token-xyz",
    });

    await waitFor(() => {
      const status = screen.getByRole("status");
      expect(status).toBeTruthy();
      expect(status.textContent).toContain("Password set successfully");
      expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("handles INVALID_TOKEN (HTTP 400) and displays clear user error", async () => {
    currentSearchParams = new URLSearchParams("token=expired-token");

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "INVALID_TOKEN",
          message: "Invalid token",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(React.createElement(SetPasswordForm));

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "validpassword1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "validpassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Invalid, expired, or already-used token.");
    });
  });

  it("handles PASSWORD_TOO_SHORT (HTTP 400) and displays controlled user error", async () => {
    currentSearchParams = new URLSearchParams("token=valid-token");

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "PASSWORD_TOO_SHORT",
          message: "Internal server error message that should not be shown directly",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(React.createElement(SetPasswordForm));

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "validlength123" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "validlength123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toBe("Password must be at least 8 characters long.");
      expect(alert.textContent).not.toContain("Internal server error message");
    });
  });

  it("displays server error message on HTTP 500", async () => {
    currentSearchParams = new URLSearchParams("token=some-token");

    fetchSpy.mockResolvedValue(
      new Response("Internal Server Error", {
        status: 500,
      })
    );

    render(React.createElement(SetPasswordForm));

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "validpassword1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "validpassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("An unexpected error occurred. Please try again.");
    });
  });

  it("displays network error message on fetch rejection", async () => {
    currentSearchParams = new URLSearchParams("token=some-token");

    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    render(React.createElement(SetPasswordForm));

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "validpassword1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "validpassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Network error. Please try again.");
    });
  });

  it("prevents duplicate submissions while request is in flight", async () => {
    currentSearchParams = new URLSearchParams("token=some-token");

    let resolvePromise: (value: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolvePromise = resolve;
    });

    fetchSpy.mockReturnValue(pendingPromise);

    render(React.createElement(SetPasswordForm));

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "validpassword1" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "validpassword1" },
    });

    const submitBtn = screen.getByRole("button", { name: /set password/i });
    fireEvent.click(submitBtn);

    // In flight
    expect(submitBtn.getAttribute("disabled")).toBeDefined();
    expect(submitBtn.textContent).toBe("Setting password...");

    // Click again while in-flight
    fireEvent.click(submitBtn);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Resolve request
    resolvePromise!(
      new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });
  });
});
