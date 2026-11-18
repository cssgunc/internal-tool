"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MeResponse } from "@internal-tool/shared";
import { getSafeRedirectPath } from "@internal-tool/shared";
import { isPublicRoute } from "@/lib/routes";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "authenticated"; user: MeResponse }
  | { status: "error"; message: string };

export function UserHeader() {
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = !pathname || isPublicRoute(pathname);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [state, setState] = useState<State>(() =>
    isPublic ? { status: "idle" } : { status: "loading" }
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Adjust state during render when route changes (standard React pattern to avoid cascading renders)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (isPublic) {
      setState({ status: "idle" });
    } else {
      setState({ status: "loading" });
    }
  }

  useEffect(() => {
    let ignore = false;

    if (!pathname || isPublicRoute(pathname)) {
      return;
    }

    async function loadUser() {
      try {
        const res = await fetch("/api/v1/me", {
          credentials: "same-origin",
        });

        if (ignore) return;

        if (res.ok) {
          const data = (await res.json()) as MeResponse;
          // Ensure cancellation check also covers after the async res.json() parse
          if (ignore) return;
          setState({ status: "authenticated", user: data });
        } else if (res.status === 401) {
          if (ignore) return;
          setState({ status: "idle" });
          let currentTarget = pathname;
          if (
            typeof window !== "undefined" &&
            window.location.search &&
            !currentTarget.includes("?")
          ) {
            currentTarget = `${currentTarget}${window.location.search}`;
          }
          const safeDestination = getSafeRedirectPath(currentTarget, "/");
          const isLoop =
            safeDestination === "/sign-in" ||
            safeDestination.startsWith("/sign-in/") ||
            safeDestination.startsWith("/sign-in?") ||
            safeDestination === "/set-password" ||
            safeDestination.startsWith("/set-password/") ||
            safeDestination.startsWith("/set-password?");
          const destination = isLoop ? "/" : safeDestination;
          router.push(`/sign-in?next=${encodeURIComponent(destination)}`);
          router.refresh();
        } else {
          if (ignore) return;
          setState({
            status: "error",
            message: "Failed to load user information.",
          });
        }
      } catch {
        if (!ignore) {
          setState({
            status: "error",
            message: "Network error loading user information.",
          });
        }
      }
    }

    void loadUser();

    return () => {
      ignore = true;
    };
  }, [pathname, router, retryTrigger]);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setSignOutError(null);

    try {
      const res = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
      });

      if (!res.ok) {
        setIsSigningOut(false);
        setSignOutError("Failed to sign out. Please try again.");
        return;
      }

      setSignOutError(null);
      // Clear user state immediately to avoid displaying stale user information
      setState({ status: "idle" });
      router.push("/sign-in");
      router.refresh();
    } catch {
      setIsSigningOut(false);
      setSignOutError("Network error during sign out. Please try again.");
    }
  };

  const handleRetry = () => {
    setState({ status: "loading" });
    setRetryTrigger((prev) => prev + 1);
  };

  // Do not render anything on public exempt routes (avoids layout shift and unnecessary auth checks)
  if (isPublic) {
    return null;
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-base font-bold text-navy hover:text-navy/80">
            CSSG Internal Tool
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {state.status === "loading" && (
            <span role="status" aria-live="polite" className="text-xs text-neutral-400">
              Loading...
            </span>
          )}

          {state.status === "authenticated" && (
            <div className="flex items-center gap-3">
              {signOutError && (
                <div role="alert" className="flex items-center gap-2">
                  <span className="text-xs text-red-600">{signOutError}</span>
                </div>
              )}
              <span className="text-sm font-medium text-neutral-800">{state.user.name}</span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          )}

          {state.status === "error" && (
            <div role="alert" className="flex items-center gap-2">
              <span className="text-xs text-red-600">{state.message}</span>
              <button
                type="button"
                onClick={handleRetry}
                className="text-xs font-medium text-navy underline hover:text-navy/80"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
