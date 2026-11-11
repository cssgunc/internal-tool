import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Home from "../src/app/page";
import InterestMeetingsRedirect from "../src/app/interest-meetings/page";
import ExecInterestMeetingsPage from "../src/app/exec/interest-meetings/page";

describe("exec routes and navigation", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    cleanup();
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
  });
});
