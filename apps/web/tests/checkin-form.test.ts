import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { CheckinForm } from "../src/components/CheckinForm";

interface TurnstileWidgetParams {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
}

interface WindowWithTurnstile {
  turnstile?: {
    render: (c: unknown, params: TurnstileWidgetParams) => string;
    reset: (widgetId: string) => void;
    remove: (widgetId: string) => void;
  };
}

describe("CheckinForm component submission and retry behavior", () => {
  let fetchSpy: ReturnType<typeof spyOn>;
  let turnstileWidgetParams: TurnstileWidgetParams | null = null;
  let turnstileResetCalls: number;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch");
    turnstileResetCalls = 0;
    turnstileWidgetParams = null;

    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: (_c, params) => {
        turnstileWidgetParams = params;
        return "widget-mock-id";
      },
      reset: () => {
        turnstileResetCalls++;
      },
      remove: () => {},
    };

    const existing = document.getElementById("cloudflare-turnstile-script");
    if (existing) existing.remove();
  });

  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
    const existing = document.getElementById("cloudflare-turnstile-script");
    if (existing) existing.remove();
  });

  async function mountForm(props: { token?: string; meetingTitle?: string } = {}) {
    render(React.createElement(CheckinForm, props));
    // Trigger script load event if script tag is mounted
    const script = document.getElementById(
      "cloudflare-turnstile-script"
    ) as HTMLScriptElement | null;
    if (script) {
      await act(async () => {
        fireEvent.load(script);
      });
    }
  }

  function fillFormFields(data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    projectInterest?: boolean;
    educationInterest?: boolean;
    execInterest?: boolean;
  }) {
    if (data.firstName !== undefined) {
      fireEvent.change(screen.getByLabelText(/first name/i), {
        target: { value: data.firstName },
      });
    }
    if (data.lastName !== undefined) {
      fireEvent.change(screen.getByLabelText(/last name/i), {
        target: { value: data.lastName },
      });
    }
    if (data.email !== undefined) {
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: data.email },
      });
    }
    if (data.projectInterest) {
      fireEvent.click(screen.getByLabelText(/project teams/i));
    }
    if (data.educationInterest) {
      fireEvent.click(screen.getByLabelText(/education program/i));
    }
    if (data.execInterest) {
      fireEvent.click(screen.getByLabelText(/executive team/i));
    }
  }

  async function completeTurnstile(token = "valid-cf-token") {
    await act(async () => {
      turnstileWidgetParams?.callback?.(token);
    });
  }

  function getSubmitButton(): HTMLButtonElement {
    return screen.getByRole("button", { name: /check in|join list/i }) as HTMLButtonElement;
  }

  it("keeps submit button disabled on initial render and when fields are filled without Turnstile", async () => {
    await mountForm({ meetingTitle: "Fall Kickoff" });

    const submitBtn = getSubmitButton();
    expect(submitBtn.disabled).toBe(true);

    fillFormFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      projectInterest: true,
    });

    // Still disabled without Turnstile
    expect(submitBtn.disabled).toBe(true);
  });

  it("enables submit button only after Turnstile verification completes", async () => {
    await mountForm({ meetingTitle: "Fall Kickoff" });
    const submitBtn = getSubmitButton();

    expect(submitBtn.disabled).toBe(true);

    fillFormFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      projectInterest: true,
    });

    await completeTurnstile("cf-token-123");

    expect(submitBtn.disabled).toBe(false);
  });

  it("blocks programmatic submission without Turnstile token with client error", async () => {
    let fetchCalled = false;
    fetchSpy.mockImplementation(() => {
      fetchCalled = true;
      return Promise.resolve(Response.json({ success: true }, { status: 200 }));
    });

    await mountForm();
    fillFormFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      projectInterest: true,
    });

    const form = getSubmitButton().closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(fetchCalled).toBe(false);

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner.textContent).toContain("Please complete the verification.");
  });

  it("on HTTP 400 validation error: resets widget, clears token, disables button, and PRESERVES entered values", async () => {
    await mountForm({ meetingTitle: "Tech Talk" });
    fillFormFields({
      firstName: "Alex",
      lastName: "Smith",
      email: "alex@example.com",
      projectInterest: true,
      educationInterest: true,
    });
    await completeTurnstile("cf-token-400");

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: "VALIDATION",
              message: "Validation failed",
              fields: { email: "Email domain is invalid" },
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        )
      )
    );

    const submitBtn = getSubmitButton();
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Reset must be called
    expect(turnstileResetCalls).toBe(1);

    // Submit button disabled
    expect(getSubmitButton().disabled).toBe(true);

    // Form values PRESERVED
    const fnInput = screen.getByLabelText(/first name/i) as HTMLInputElement;
    const lnInput = screen.getByLabelText(/last name/i) as HTMLInputElement;
    const emInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(fnInput.value).toBe("Alex");
    expect(lnInput.value).toBe("Smith");
    expect(emInput.value).toBe("alex@example.com");

    // Field error rendered
    expect(screen.getByText("Email domain is invalid")).toBeTruthy();
  });

  it("on HTTP 429 rate limit: displays clear rate-limit feedback, resets widget, disables button, and PRESERVES values", async () => {
    await mountForm({ meetingTitle: "Demo Day" });
    fillFormFields({
      firstName: "Taylor",
      lastName: "Swift",
      email: "taylor@example.com",
      execInterest: true,
    });
    await completeTurnstile("cf-token-429");

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: "RATE_LIMITED", message: "Too many requests" },
          }),
          { status: 429, headers: { "content-type": "application/json" } }
        )
      )
    );

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    expect(turnstileResetCalls).toBe(1);
    expect(getSubmitButton().disabled).toBe(true);

    // Clear rate limit message
    const alertBanner = screen.getByRole("alert");
    expect(alertBanner.textContent).toContain(
      "Too many attempts. Please wait a moment before trying again."
    );

    // Preserved fields
    const fnInput = screen.getByLabelText(/first name/i) as HTMLInputElement;
    const lnInput = screen.getByLabelText(/last name/i) as HTMLInputElement;
    const emInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(fnInput.value).toBe("Taylor");
    expect(lnInput.value).toBe("Swift");
    expect(emInput.value).toBe("taylor@example.com");
  });

  it("on HTTP 500 server error: displays error message, resets widget, and PRESERVES values", async () => {
    await mountForm({ meetingTitle: "Workshop" });
    fillFormFields({
      firstName: "Sam",
      lastName: "Brown",
      email: "sam@example.com",
      projectInterest: true,
    });
    await completeTurnstile("cf-token-500");

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: "INTERNAL", message: "Internal server error occurred." },
          }),
          { status: 500, headers: { "content-type": "application/json" } }
        )
      )
    );

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    expect(turnstileResetCalls).toBe(1);
    expect(getSubmitButton().disabled).toBe(true);

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner.textContent).toContain("Internal server error occurred.");

    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe("Sam");
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe("Brown");
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe("sam@example.com");
  });

  it("on network failure: displays connection error, resets widget, and PRESERVES values", async () => {
    await mountForm({ meetingTitle: "Workshop" });
    fillFormFields({
      firstName: "Morgan",
      lastName: "Lee",
      email: "morgan@example.com",
      educationInterest: true,
    });
    await completeTurnstile("cf-token-net");

    fetchSpy.mockImplementation(() => Promise.reject(new Error("Network connection lost")));

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    expect(turnstileResetCalls).toBe(1);
    expect(getSubmitButton().disabled).toBe(true);

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner.textContent).toContain(
      "Could not submit check-in. Please check your internet connection and try again."
    );

    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe("Morgan");
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe("Lee");
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe("morgan@example.com");
  });

  it("on Turnstile token expiry (onExpire): resets widget, disables button, displays expiry message, and PRESERVES values", async () => {
    await mountForm();
    fillFormFields({
      firstName: "Chris",
      lastName: "Evans",
      email: "chris@example.com",
      projectInterest: true,
    });
    await completeTurnstile("initial-token");

    expect(getSubmitButton().disabled).toBe(false);

    // Trigger onExpire callback
    await act(async () => {
      turnstileWidgetParams?.["expired-callback"]?.();
    });

    expect(turnstileResetCalls).toBe(1);
    expect(getSubmitButton().disabled).toBe(true);

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner.textContent).toContain("Verification expired. Please verify again.");

    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe("Chris");
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe("Evans");
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe("chris@example.com");
  });

  it("on Turnstile error (onError): resets widget, disables button, displays error message, and PRESERVES values", async () => {
    await mountForm();
    fillFormFields({
      firstName: "Jordan",
      lastName: "Peele",
      email: "jordan@example.com",
      execInterest: true,
    });
    await completeTurnstile("initial-token");

    // Trigger onError callback
    await act(async () => {
      turnstileWidgetParams?.["error-callback"]?.();
    });

    expect(turnstileResetCalls).toBe(1);
    expect(getSubmitButton().disabled).toBe(true);

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner.textContent).toContain("Verification check failed. Please retry.");

    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe("Jordan");
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe("Peele");
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe("jordan@example.com");
  });

  it("meeting check-in renders neutral success message and does NOT claim attendance recorded", async () => {
    await mountForm({ token: "tok-abc", meetingTitle: "General Interest Meeting 1" });
    fillFormFields({
      firstName: "Sam",
      lastName: "Jones",
      email: "sam.jones@example.com",
      projectInterest: true,
    });
    await completeTurnstile("valid-token");

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: /check-in submitted/i })).toBeTruthy();
    });

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("Your check-in was submitted successfully.");
    expect(bodyText.toLowerCase()).not.toContain("attendance recorded");
    expect(bodyText.toLowerCase()).not.toContain("attendance has been recorded");
  });

  it("general Interested list submission renders separate list confirmation", async () => {
    await mountForm();
    fillFormFields({
      firstName: "Dana",
      lastName: "Scully",
      email: "dana@example.com",
      educationInterest: true,
    });
    await completeTurnstile("valid-token");

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: /you're on the list!/i })).toBeTruthy();
    });

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain(
      "Thanks for joining the CSSG Interested list. We'll be in touch with updates!"
    );
  });
});
