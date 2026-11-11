import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import type { Mock } from "bun:test";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "../src/app/page";
import InterestMeetingsRedirect from "../src/app/interest-meetings/page";
import ExecInterestMeetingsPage from "../src/app/exec/interest-meetings/page";
import CheckinPage from "../src/app/checkin/page";

describe("exec routes and navigation", () => {
  let fetchSpy: Mock<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected API request"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("homepage does not contain an unauthenticated meeting creation link", () => {
    render(React.createElement(Home));

    expect(screen.getByRole("link", { name: /join interested list/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /semesters list/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /create meeting/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /interest-meetings/i })).toBeNull();
  });

  it("/interest-meetings performs redirect to /exec/interest-meetings", () => {
    let redirectedPath = "";
    try {
      InterestMeetingsRedirect();
    } catch (e: unknown) {
      const err = e as { digest?: string; message?: string };
      redirectedPath = err.digest || err.message || "";
    }

    expect(redirectedPath).toContain("/exec/interest-meetings");
  });

  it("renders the public general signup page without a meeting lookup", () => {
    render(React.createElement(CheckinPage));
    expect(screen.getByRole("heading", { name: "Join the Interested List" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join List" })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["server", "network"])(
    "keeps meeting inputs available after a %s error",
    async (failure) => {
      if (failure === "server")
        fetchSpy.mockResolvedValue(
          Response.json(
            { error: { code: "CONFLICT", message: "No semester is currently active." } },
            { status: 409 }
          )
        );
      else fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
      render(React.createElement(ExecInterestMeetingsPage));
      fireEvent.change(screen.getByLabelText(/meeting title/i), {
        target: { value: "Fall Kickoff" },
      });
      fireEvent.change(screen.getByLabelText(/start time/i), {
        target: { value: "2026-11-11T18:00" },
      });
      fireEvent.click(screen.getByRole("button", { name: /create meeting/i }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        failure === "server"
          ? "No semester is currently active."
          : "Network error. Please try again."
      );
      expect((screen.getByLabelText(/meeting title/i) as HTMLInputElement).value).toBe(
        "Fall Kickoff"
      );
      expect((screen.getByLabelText(/start time/i) as HTMLInputElement).value).toBe(
        "2026-11-11T18:00"
      );
      expect(
        (screen.getByRole("button", { name: /create meeting/i }) as HTMLButtonElement).disabled
      ).toBe(false);
      expect(screen.queryByRole("img", { name: /QR code/i })).toBeNull();
    }
  );

  it("/exec/interest-meetings renders creation form and displays QR code on creation", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        Response.json({
          id: "meeting-new-123",
          checkinUrl: "http://localhost:3000/checkin/test-token-777",
          qrSvg:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="black"/></svg>',
        })
      )
    );

    render(React.createElement(ExecInterestMeetingsPage));

    const titleInput = screen.getByLabelText(/meeting title/i);
    const startsAtInput = screen.getByLabelText(/start time/i);

    fireEvent.change(titleInput, { target: { value: "Spring Project Showcase" } });
    fireEvent.change(startsAtInput, { target: { value: "2026-03-15T18:00" } });

    fireEvent.click(screen.getByRole("button", { name: /create meeting/i }));

    await waitFor(() => {
      expect(screen.getByText("Spring Project Showcase")).toBeTruthy();
    });

    expect(screen.getByText("Check-in Open")).toBeTruthy();
    expect(screen.getByText("http://localhost:3000/checkin/test-token-777")).toBeTruthy();
    const qrContainer = screen.getByRole("img", {
      name: "QR code for Spring Project Showcase check-in",
    });
    expect(qrContainer).toBeTruthy();
    expect(qrContainer.querySelector("svg")).not.toBeNull();
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      title: "Spring Project Showcase",
      startsAt: new Date("2026-03-15T18:00").toISOString(),
    });
  });
});
