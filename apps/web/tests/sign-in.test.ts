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
import { SignInForm } from "../src/components/SignInForm";
import SignInPage from "../src/app/sign-in/page";

describe("SignInForm and /sign-in page", () => {
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

  it("renders the sign-in page with email and password inputs and a submit button", () => {
    render(React.createElement(SignInPage));

    expect(screen.getByRole("heading", { name: "CSSG Internal Tool" })).toBeTruthy();
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("successfully signs in and navigates to '/' by default", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(React.createElement(SignInForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "correctpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const call = fetchSpy.mock.calls[0];
    expect(call).toBeDefined();
    const [url, options] = call!;
    expect(url).toBe("/api/auth/sign-in/email");
    expect(options?.method).toBe("POST");
    expect(options?.credentials).toBe("same-origin");
    expect(JSON.parse(options?.body as string)).toEqual({
      email: "user@example.com",
      password: "correctpassword",
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("navigates to a validated ?next= path after successful sign-in", async () => {
    currentSearchParams = new URLSearchParams("next=/semesters");

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(React.createElement(SignInForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "correctpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/semesters");
    });
  });

  it.each([
    ["external URL", "https://evil.com"],
    ["protocol-relative URL", "//evil.com"],
    ["backslash URL", "/\\evil.com"],
    ["backslash-only URL", "\\evil.com"],
    ["own page to avoid loop", "/sign-in"],
    ["own page with query to avoid loop", "/sign-in?next=/foo"],
    ["own page with trailing slash to avoid loop", "/sign-in/"],
    ["own page with hash to avoid loop", "/sign-in#section"],
  ])(
    "rejects unsafe or recursive ?next= (%s) and redirects to '/'",
    async (_: string, nextVal: string) => {
      currentSearchParams = new URLSearchParams(`next=${encodeURIComponent(nextVal)}`);

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      render(React.createElement(SignInForm));

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: "correctpassword" },
      });
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/");
      });
    }
  );

  it("displays a generic incorrect-credentials error on HTTP 401", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(React.createElement(SignInForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "wrongpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid email or password.");
    expect(mockPush).not.toHaveBeenCalled();

    // Inputs and button should be active again
    expect((screen.getByRole("button", { name: /sign in/i }) as HTMLButtonElement).disabled).toBe(
      false
    );
    expect((screen.getByLabelText(/email address/i) as HTMLInputElement).disabled).toBe(false);
  });

  it("displays generic error on HTTP 400", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: "BAD_REQUEST" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(React.createElement(SignInForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "bad@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid email or password.");
  });

  it("displays unexpected error message on server error (HTTP 500)", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(React.createElement(SignInForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("An unexpected error occurred. Please try again.");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("displays network error message on fetch rejection", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    render(React.createElement(SignInForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Network error. Please try again.");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("prevents duplicate submissions while request is in flight", async () => {
    let resolveFetch: (value: Response) => void;
    fetchSpy.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    render(React.createElement(SignInForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "password123" },
    });

    const form = screen.getByRole("button", { name: /sign in/i }).closest("form")!;
    fireEvent.submit(form);

    // Button should now show "Signing in..." and be disabled
    const submitBtn = screen.getByRole("button", {
      name: /signing in\.\.\./i,
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect((screen.getByLabelText(/email address/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).disabled).toBe(true);

    // Attempt second submission
    fireEvent.submit(form);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Complete the fetch
    resolveFetch!(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
