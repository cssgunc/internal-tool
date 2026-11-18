"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export interface TurnstileRef {
  reset: () => void;
}

export interface TurnstileProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  className?: string;
  ref?: React.Ref<TurnstileRef>;
}

const DEFAULT_SITE_KEY = "1x00000000000000000000AA";

export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(function Turnstile(
  { onSuccess, onError, onExpire, className },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  onExpireRef.current = onExpire;

  const isProduction = process.env.NODE_ENV === "production";
  const configuredSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const siteKey = configuredSiteKey || (isProduction ? undefined : DEFAULT_SITE_KEY);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          // Ignore reset errors
        }
      }
    },
  }));

  useEffect(() => {
    if (!siteKey) return;
    const currentSiteKey = siteKey;
    let isMounted = true;

    function renderWidget() {
      if (!isMounted || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return;

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: currentSiteKey,
          callback: (token: string) => {
            if (isMounted) onSuccessRef.current(token);
          },
          "error-callback": () => {
            if (isMounted && onErrorRef.current) onErrorRef.current();
          },
          "expired-callback": () => {
            if (isMounted && onExpireRef.current) onExpireRef.current();
          },
        });
      } catch {
        if (isMounted && onErrorRef.current) {
          onErrorRef.current();
        }
      }
    }

    const scriptId = "cloudflare-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const handleLoad = () => {
      renderWidget();
    };

    const handleError = () => {
      if (isMounted && onErrorRef.current) {
        onErrorRef.current();
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
      document.head.appendChild(script);
    } else if (window.turnstile) {
      renderWidget();
    } else {
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
    }

    return () => {
      isMounted = false;
      if (script) {
        script.removeEventListener("load", handleLoad);
        script.removeEventListener("error", handleError);
      }
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) {
    return (
      <div
        role="alert"
        className="my-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800"
      >
        Verification is temporarily unavailable. Please contact the administrator.
      </div>
    );
  }

  return <div ref={containerRef} className={className ?? "my-4 flex justify-center"} />;
});
