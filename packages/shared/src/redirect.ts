function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Validates whether a target path is safe for client- or server-side redirection.
 *
 * Rejects:
 * - Non-string and empty inputs
 * - External URLs (e.g., "https://evil.com", "http://evil.com", "ftp://...")
 * - Protocol-relative URLs (e.g., "//evil.com", "///evil.com")
 * - Backslash-based redirects (e.g., "/\\evil.com", "\\evil.com", "\\/evil.com", "/foo\\bar")
 * - Encoded tricks (e.g., "/%2f%2fevil.com", "/%5cevil.com")
 * - Newlines and control characters (e.g., "\n", "\r", "\t", null bytes)
 * - Non-HTTP schemes (e.g., "javascript:alert(1)", "data:text/html,...")
 */
export function isSafeRedirectPath(target: unknown): target is string {
  if (typeof target !== "string" || target.trim().length === 0) {
    return false;
  }

  // Must begin with a single slash and not double slashes or backslashes
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return false;
  }

  // Reject any backslashes in the raw target
  if (target.includes("\\")) {
    return false;
  }

  // Reject control characters and newlines
  if (hasControlCharacters(target)) {
    return false;
  }

  try {
    const base = "http://localhost";
    const parsed = new URL(target, base);

    // Must remain on the dummy origin without escaping to external host
    if (parsed.origin !== base) {
      return false;
    }

    // Inspect decoded pathname to prevent encoded slashes/backslashes bypasses
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (
      decodedPath.includes("\\") ||
      decodedPath.startsWith("//") ||
      decodedPath.startsWith("/\\") ||
      hasControlCharacters(decodedPath)
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Returns the target path if safe, or a validated fallback path (defaulting to "/").
 */
export function getSafeRedirectPath(target: unknown, fallback: string = "/"): string {
  const safeFallback = isSafeRedirectPath(fallback) ? fallback : "/";
  if (isSafeRedirectPath(target)) {
    return target;
  }
  return safeFallback;
}
