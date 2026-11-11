import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CheckinForm } from "../src/components/CheckinForm";
import {
  installDomShim,
  uninstallDomShim,
  mockFetch,
  restoreFetch,
  type SimpleElement,
} from "./dom-shim";

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

describe("CheckinForm Component (R2 & R3)", () => {
  let doc: ReturnType<typeof installDomShim>;
  let container: SimpleElement;
  let root: Root;
  let turnstileWidgetParams: TurnstileWidgetParams | null = null;
  let turnstileResetCalls: number;

  beforeEach(() => {
    doc = installDomShim();
    container = doc.createElement("div");
    root = createRoot(container as unknown as HTMLElement);
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
  });

  afterEach(async () => {
    restoreFetch();
    await act(async () => {
      root.unmount();
    });
    uninstallDomShim();
  });

  async function mountForm(props: { token?: string; meetingTitle?: string } = {}) {
    await act(async () => {
      root.render(React.createElement(CheckinForm, props));
    });
    // Trigger script load to initialize Turnstile widget
    const script = doc.getElementById("cloudflare-turnstile-script");
    if (script) {
      await act(async () => {
        script.dispatchEvent({ type: "load" });
      });
    }
  }

  async function fillFormFields(data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    projectInterest?: boolean;
    educationInterest?: boolean;
    execInterest?: boolean;
  }) {
    if (data.firstName !== undefined) {
      const input = container.querySelector((n) => n.id === "firstName");
      await act(async () => {
        input?.simulateChange(data.firstName as string);
      });
    }
    if (data.lastName !== undefined) {
      const input = container.querySelector((n) => n.id === "lastName");
      await act(async () => {
        input?.simulateChange(data.lastName as string);
      });
    }
    if (data.email !== undefined) {
      const input = container.querySelector((n) => n.id === "email");
      await act(async () => {
        input?.simulateChange(data.email as string);
      });
    }
    if (data.projectInterest) {
      const cb = container.querySelector((n) => n.id === "interest-project");
      await act(async () => {
        const onChange = cb?.reactProps.onChange as (() => void) | undefined;
        onChange?.();
      });
    }
    if (data.educationInterest) {
      const cb = container.querySelector((n) => n.id === "interest-education");
      await act(async () => {
        const onChange = cb?.reactProps.onChange as (() => void) | undefined;
        onChange?.();
      });
    }
    if (data.execInterest) {
      const cb = container.querySelector((n) => n.id === "interest-exec");
      await act(async () => {
        const onChange = cb?.reactProps.onChange as (() => void) | undefined;
        onChange?.();
      });
    }
  }

  async function completeTurnstile(token = "valid-cf-token") {
    await act(async () => {
      turnstileWidgetParams?.callback?.(token);
    });
  }

  function getSubmitButton(): SimpleElement | null {
    return container.querySelector((n) => n.nodeName === "BUTTON" && n.type === "submit");
  }

  function getForm(): SimpleElement | null {
    return container.querySelector((n) => n.nodeName === "FORM");
  }

  it("keeps submit button disabled on initial render and when fields are filled without Turnstile (R2)", async () => {
    await mountForm({ meetingTitle: "Fall Kickoff" });

    const submitBtn = getSubmitButton();
    expect(submitBtn?.disabled).toBe(true);

    await fillFormFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      projectInterest: true,
    });

    // Still disabled without Turnstile
    expect(submitBtn?.disabled).toBe(true);
  });

  it("enables submit button only after Turnstile verification completes (R2)", async () => {
    await mountForm({ meetingTitle: "Fall Kickoff" });
    const submitBtn = getSubmitButton();

    expect(submitBtn?.disabled).toBe(true);

    await fillFormFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      projectInterest: true,
    });

    await completeTurnstile("cf-token-123");

    expect(submitBtn?.disabled).toBe(false);
  });

  it("blocks programmatic submission without Turnstile token with client error (R2)", async () => {
    let fetchCalled = false;
    mockFetch(async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    await mountForm();
    await fillFormFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      projectInterest: true,
    });

    const form = getForm();
    await act(async () => {
      form?.simulateSubmit();
    });

    // Fetch MUST NOT be called
    expect(fetchCalled).toBe(false);

    const errorMsg = container.querySelector(
      (n) => n.role === "alert" && n.textContent.includes("Please complete the verification.")
    );
    expect(errorMsg).not.toBeNull();
  });

  it("on HTTP 400 validation error: resets widget, clears token, disables button, and PRESERVES entered values (R2)", async () => {
    await mountForm({ meetingTitle: "Tech Talk" });
    await fillFormFields({
      firstName: "Alex",
      lastName: "Smith",
      email: "alex@example.com",
      projectInterest: true,
      educationInterest: true,
    });
    await completeTurnstile("cf-token-400");

    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION",
            message: "Validation failed",
            fields: { email: "Email domain is invalid" },
          },
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    });

    const form = getForm();
    await act(async () => {
      await form?.simulateSubmit();
    });

    // Reset must be called
    expect(turnstileResetCalls).toBe(1);

    // Submit button disabled
    const submitBtn = getSubmitButton();
    expect(submitBtn?.disabled).toBe(true);

    // Form values PRESERVED
    const fnInput = container.querySelector((n) => n.id === "firstName");
    const lnInput = container.querySelector((n) => n.id === "lastName");
    const emInput = container.querySelector((n) => n.id === "email");
    expect(fnInput?.value).toBe("Alex");
    expect(lnInput?.value).toBe("Smith");
    expect(emInput?.value).toBe("alex@example.com");

    // Field error rendered
    const fieldError = container.querySelector((n) => n.id === "email-error");
    expect(fieldError?.textContent).toBe("Email domain is invalid");
  });

  it("on HTTP 429 rate limit: displays clear rate-limit feedback, resets widget, disables button, and PRESERVES values (R2)", async () => {
    await mountForm({ meetingTitle: "Demo Day" });
    await fillFormFields({
      firstName: "Taylor",
      lastName: "Swift",
      email: "taylor@example.com",
      execInterest: true,
    });
    await completeTurnstile("cf-token-429");

    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          error: { code: "RATE_LIMITED", message: "Too many requests" },
        }),
        {
          status: 429,
          headers: { "content-type": "application/json" },
        }
      );
    });

    const form = getForm();
    await act(async () => {
      await form?.simulateSubmit();
    });

    expect(turnstileResetCalls).toBe(1);
    expect(getSubmitButton()?.disabled).toBe(true);

    // Clear rate limit message
    const alertBanner = container.querySelector(
      (n) =>
        n.role === "alert" &&
        n.textContent.includes("Too many attempts. Please wait a moment before trying again.")
    );
    expect(alertBanner).not.toBeNull();

    // Preserved fields
    const fnInput = container.querySelector((n) => n.id === "firstName");
    const lnInput = container.querySelector((n) => n.id === "lastName");
    const emInput = container.querySelector((n) => n.id === "email");
    expect(fnInput?.value).toBe("Taylor");
    expect(lnInput?.value).toBe("Swift");
    expect(emInput?.value).toBe("taylor@example.com");
  });

  it("on HTTP 500 server error: displays error message, resets widget, and PRESERVES values (R2)", async () => {
    await mountForm({ meetingTitle: "Workshop" });
    await fillFormFields({
      firstName: "Sam",
      lastName: "Brown",
      email: "sam@example.com",
      projectInterest: true,
    });
    await completeTurnstile("cf-token-500");

    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          error: { code: "INTERNAL", message: "Internal server error occurred." },
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    });

    const form = getForm();
    await act(async () => {
      await form?.simulateSubmit();
    });

    expect(turnstileResetCalls).toBe(1);
    expect(getSubmitButton()?.disabled).toBe(true);

    const alertBanner = container.querySelector(
      (n) => n.role === "alert" && n.textContent.includes("Internal server error occurred.")
    );
    expect(alertBanner).not.toBeNull();

    expect(container.querySelector((n) => n.id === "firstName")?.value).toBe("Sam");
    expect(container.querySelector((n) => n.id === "lastName")?.value).toBe("Brown");
    expect(container.querySelector((n) => n.id === "email")?.value).toBe("sam@example.com");
  });

  it("on network failure: displays connection error, resets widget, and PRESERVES values (R2)", async () => {
    await mountForm({ meetingTitle: "Workshop" });
    await fillFormFields({
      firstName: "Morgan",
      lastName: "Lee",
      email: "morgan@example.com",
      educationInterest: true,
    });
    await completeTurnstile("cf-token-net");

    mockFetch(async () => {
      throw new Error("Network connection lost");
    });

    const form = getForm();
    await act(async () => {
      await form?.simulateSubmit();
    });

    expect(turnstileResetCalls).toBe(1);
    expect(getSubmitButton()?.disabled).toBe(true);

    const alertBanner = container.querySelector(
      (n) =>
        n.role === "alert" &&
        n.textContent.includes(
          "Could not submit check-in. Please check your internet connection and try again."
        )
    );
    expect(alertBanner).not.toBeNull();

    expect(container.querySelector((n) => n.id === "firstName")?.value).toBe("Morgan");
    expect(container.querySelector((n) => n.id === "lastName")?.value).toBe("Lee");
    expect(container.querySelector((n) => n.id === "email")?.value).toBe("morgan@example.com");
  });

  it("on Turnstile token expiry (onExpire): resets widget, disables button, displays expiry message, and PRESERVES values (R2)", async () => {
    await mountForm();
    await fillFormFields({
      firstName: "Chris",
      lastName: "Evans",
      email: "chris@example.com",
      projectInterest: true,
    });
    await completeTurnstile("initial-token");

    expect(getSubmitButton()?.disabled).toBe(false);

    // Trigger onExpire callback
    await act(async () => {
      turnstileWidgetParams?.["expired-callback"]?.();
    });

    expect(turnstileResetCalls).toBe(1);
    expect(getSubmitButton()?.disabled).toBe(true);

    const errorMsg = container.querySelector(
      (n) =>
        n.role === "alert" && n.textContent.includes("Verification expired. Please verify again.")
    );
    expect(errorMsg).not.toBeNull();

    expect(container.querySelector((n) => n.id === "firstName")?.value).toBe("Chris");
    expect(container.querySelector((n) => n.id === "lastName")?.value).toBe("Evans");
    expect(container.querySelector((n) => n.id === "email")?.value).toBe("chris@example.com");
  });

  it("on Turnstile error (onError): resets widget, disables button, displays error message, and PRESERVES values (R2)", async () => {
    await mountForm();
    await fillFormFields({
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
    expect(getSubmitButton()?.disabled).toBe(true);

    const errorMsg = container.querySelector(
      (n) =>
        n.role === "alert" && n.textContent.includes("Verification check failed. Please retry.")
    );
    expect(errorMsg).not.toBeNull();

    expect(container.querySelector((n) => n.id === "firstName")?.value).toBe("Jordan");
    expect(container.querySelector((n) => n.id === "lastName")?.value).toBe("Peele");
    expect(container.querySelector((n) => n.id === "email")?.value).toBe("jordan@example.com");
  });

  it("meeting check-in renders neutral success message and does NOT claim attendance recorded (R3)", async () => {
    await mountForm({ token: "tok-abc", meetingTitle: "General Interest Meeting 1" });
    await fillFormFields({
      firstName: "Sam",
      lastName: "Jones",
      email: "sam.jones@example.com",
      projectInterest: true,
    });
    await completeTurnstile("valid-token");

    mockFetch(async () => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const form = getForm();
    await act(async () => {
      await form?.simulateSubmit();
    });

    const fullText = container.textContent;

    // Must show neutral check-in confirmation
    expect(fullText).toContain("Check-in Submitted");
    expect(fullText).toContain("Your check-in was submitted successfully.");

    // Must NOT claim attendance was recorded
    expect(fullText.toLowerCase()).not.toContain("attendance recorded");
    expect(fullText.toLowerCase()).not.toContain("attendance has been recorded");
  });

  it("general Interested list submission renders separate list confirmation (R3)", async () => {
    // No meetingTitle provided -> General Interested List check-in
    await mountForm();
    await fillFormFields({
      firstName: "Dana",
      lastName: "Scully",
      email: "dana@example.com",
      educationInterest: true,
    });
    await completeTurnstile("valid-token");

    mockFetch(async () => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const form = getForm();
    await act(async () => {
      await form?.simulateSubmit();
    });

    const fullText = container.textContent;

    expect(fullText).toContain("You're on the List!");
    expect(fullText).toContain(
      "Thanks for joining the CSSG Interested list. We'll be in touch with updates!"
    );
  });
});
