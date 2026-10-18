import type { ErrorCode, ErrorResponse } from "@internal-tool/shared";
import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500;

/** Expected failures that routes and services can throw without constructing a response. */
export class ApiError extends Error {
  constructor(
    public readonly status: ApiErrorStatus,
    public readonly code: ErrorCode,
    message: string,
    public readonly fields?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>
): ErrorResponse {
  return { error: { code, message, ...(fields === undefined ? {} : { fields }) } };
}

const httpErrors = {
  400: ["VALIDATION", "Invalid request."],
  401: ["UNAUTHORIZED", "Sign in to continue."],
  403: ["FORBIDDEN", "You do not have access to this resource."],
  404: ["NOT_FOUND", "Resource not found."],
  409: ["CONFLICT", "The request conflicts with the current state."],
  429: ["RATE_LIMITED", "Too many requests."],
} as const;

export const handleError: ErrorHandler = (error, c) => {
  if (error instanceof ApiError) {
    return c.json(errorResponse(error.code, error.message, error.fields), error.status);
  }

  // Normalize framework exceptions too, rather than returning Hono's default text response.
  if (error instanceof HTTPException && error.status in httpErrors) {
    const status = error.status as keyof typeof httpErrors;
    const [code, message] = httpErrors[status];
    return c.json(errorResponse(code, message), status);
  }

  // Diagnostic details stay in server logs, including when NODE_ENV=production.
  console.error(error);
  return c.json(errorResponse("INTERNAL", "An unexpected error occurred."), 500);
};

export const handleNotFound: NotFoundHandler = (c) =>
  c.json(errorResponse("NOT_FOUND", "Resource not found."), 404);
