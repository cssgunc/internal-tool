import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../src/app/page";
import InterestMeetingsRedirect from "../src/app/interest-meetings/page";
import ExecInterestMeetingsPage from "../src/app/exec/interest-meetings/page";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  installDomShim,
  uninstallDomShim,
  mockFetch,
  restoreFetch,
  type SimpleElement,
} from "./dom-shim";

describe("Exec Route Cleanliness & Redirection (R4)", () => {
  let doc: ReturnType<typeof installDomShim>;
  let container: SimpleElement;
  let root: Root;

  beforeEach(() => {
    doc = installDomShim();
    container = doc.createElement("div");
    root = createRoot(container as unknown as HTMLElement);
  });

  afterEach(async () => {
    restoreFetch();
    await act(async () => {
      root.unmount();
    });
    uninstallDomShim();
  });

  it("homepage (/) has NO unauthenticated meeting creation link (R4)", () => {
    const html = renderToStaticMarkup(React.createElement(Home));

    // Must link to public /checkin and /semesters
    expect(html).toContain('href="/checkin"');
    expect(html).toContain('href="/semesters"');

    // Must NOT link to exec/interest meeting creation
    expect(html).not.toContain('href="/interest-meetings"');
    expect(html).not.toContain('href="/exec/interest-meetings"');
    expect(html).not.toContain("Create Meeting");
    expect(html).not.toContain("Create Interest Meeting");
  });

  it("/interest-meetings performs redirect to /exec/interest-meetings (R4)", () => {
    let redirectedPath = "";
    try {
      InterestMeetingsRedirect();
    } catch (e: unknown) {
      const err = e as { digest?: string; message?: string };
      redirectedPath = err.digest || err.message || "";
    }

    // Next.js redirect() throws a NEXT_REDIRECT digest with destination
    expect(redirectedPath).toContain("/exec/interest-meetings");
  });

  it("/exec/interest-meetings page source code retains '// TODO(auth)' comment (R4)", () => {
    const filePath = resolve(process.cwd(), "src/app/exec/interest-meetings/page.tsx");
    const content = readFileSync(filePath, "utf-8");

    expect(content).toContain(
      "// TODO(auth): URL placement does not provide authorization; restrict meeting creation to exec and set created_by from session once auth is wired."
    );
  });

  it("/exec/interest-meetings renders creation form and displays QR code on creation (R4)", async () => {
    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          id: "meeting-new-123",
          checkinUrl: "http://localhost:3000/checkin/test-token-777",
          qrSvg:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="black"/></svg>',
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    });

    await act(async () => {
      root.render(React.createElement(ExecInterestMeetingsPage));
    });

    // Form inputs present
    const titleInput = container.querySelector((n) => n.id === "meeting-title");
    const startsAtInput = container.querySelector((n) => n.id === "meeting-startsAt");
    expect(titleInput).not.toBeNull();
    expect(startsAtInput).not.toBeNull();

    // Fill fields
    await act(async () => {
      titleInput?.simulateChange("Spring Project Showcase");
      startsAtInput?.simulateChange("2026-03-15T18:00");
    });

    const form = container.querySelector((n) => n.nodeName === "FORM");
    await act(async () => {
      await form?.simulateSubmit();
    });

    // Check projector display
    expect(container.textContent).toContain("Spring Project Showcase");
    expect(container.textContent).toContain("Check-in Open");
    expect(container.textContent).toContain("http://localhost:3000/checkin/test-token-777");

    // QR SVG container rendered
    const qrContainer = container.querySelector((n) => n.role === "img");
    expect(qrContainer).not.toBeNull();
    expect(qrContainer?.getAttribute("aria-label")).toContain(
      "QR code for Spring Project Showcase check-in"
    );
  });
});
