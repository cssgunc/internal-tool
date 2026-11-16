export const PUBLIC_ROUTE_PREFIXES = ["/sign-in", "/set-password", "/checkin"] as const;

export function isPublicRoute(pathname: string): boolean {
  const cleanPath = pathname.split(/[?#]/)[0] ?? pathname;
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => cleanPath === prefix || cleanPath.startsWith(`${prefix}/`)
  );
}
