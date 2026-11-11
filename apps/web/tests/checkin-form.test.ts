import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import type { Mock } from "bun:test";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
  let fetchSpy: Mock<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>;
  let turnstileWidgetParams: TurnstileWidgetParams | null = null;
  let turnstileResetCalls: number;
  let turnstileRenderCalls: number;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected API request"));
    turnstileResetCalls = 0;
    turnstileRenderCalls = 0;
    turnstileWidgetParams = null;

    const win = globalThis as unknown as WindowWithTurnstile;
    win.turnstile = {
      render: (_c, params) => {
        turnstileRenderCalls++;
        turnstileWidgetParams = params;
        return "widget-mock-id";
      },
      reset: () => {
        turnstileResetCalls++;
      },
      remove: () => {},
    };
  });

  afterEach(() => {
    fetchSpy.mockRestore();
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

  it("keeps the Turnstile widget mounted while editing form fields", async () => {
    await mountForm();
    fillFormFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      projectInterest: true,
    });
    await completeTurnstile();
    fillFormFields({ firstName: "Janet", educationInterest: true });
    expect(turnstileRenderCalls).toBe(1);
    expect(turnstileResetCalls).toBe(0);
    expect(getSubmitButton().disabled).toBe(false);
  });

  it("shows required-field errors without calling the API", async () => {
    await mountForm();
    await completeTurnstile();
    fireEvent.click(getSubmitButton());
    for (const message of [
      "First name is required.",
      "Last name is required.",
      "Email is required.",
      "Please select at least one interest.",
    ]) {
      expect(screen.getByText(message).getAttribute("role")).toBe("alert");
    }
    expect(screen.getByLabelText(/first name/i).getAttribute("aria-invalid")).toBe("true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hides the honeypot from people and assistive technology and disables autofill", async () => {
    await mountForm();
    const honeypot = screen.getByLabelText(/website/i) as HTMLInputElement;
    expect(screen.queryByRole("textbox", { name: /website/i })).toBeNull();
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(getComputedStyle(honeypot.parentElement!).display).toBe("none");
    expect(honeypot.autocomplete).toBe("off");
    expect(honeypot.tabIndex).toBe(-1);
  });

  it("retries a failed meeting check-in with preserved fields and a fresh token", async () => {
    await mountForm({ token: "meeting-retry", meetingTitle: "Fall Kickoff" });
    fillFormFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      projectInterest: true,
    });
    await completeTurnstile("consumed-token");
    fetchSpy.mockResolvedValueOnce(
      Response.json({ error: { code: "INTERNAL", message: "Try again later." } }, { status: 500 })
    );
    fetchSpy.mockResolvedValueOnce(Response.json({ success: true }, { status: 201 }));
    fireEvent.click(getSubmitButton());
    await screen.findByRole("alert");
    expect(getSubmitButton().disabled).toBe(true);
    expect(turnstileResetCalls).toBe(1);
    await completeTurnstile("fresh-token");
    fireEvent.click(getSubmitButton());
    await screen.findByRole("heading", { name: /check-in submitted/i });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const payloads = fetchSpy.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(payloads[0]).toMatchObject({ token: "meeting-retry", turnstileToken: "consumed-token" });
    expect(payloads[1]).toEqual({ ...payloads[0], turnstileToken: "fresh-token" });
    expect(payloads[1]).toMatchObject({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      interests: ["project"],
    });
  });

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

  it("preserves form fields and requires new verification after HTTP 400", async () => {
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

  it("shows rate-limit feedback and preserves form fields after HTTP 429", async () => {
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

  it("shows server errors and preserves form fields after HTTP 500", async () => {
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

  it("preserves form fields and requires new verification after a network failure", async () => {
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

  it("preserves form fields and requests verification when a token expires", async () => {
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

  it("preserves form fields and requests verification after a widget error", async () => {
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
