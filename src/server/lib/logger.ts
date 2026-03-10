import { toErrorCode } from "@/server/lib/errors";

type LogContext = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /token|secret|password|key|email|authorization/i;

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";

  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(key, item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      output[k] = sanitizeValue(k, v);
    }
    return output;
  }

  return value;
}

function sanitizeContext(context: LogContext): LogContext {
  const safe: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    safe[key] = sanitizeValue(key, value);
  }
  return safe;
}

export function logServerError(
  operation: string,
  error: unknown,
  context: LogContext = {},
): void {
  const code = toErrorCode(error);
  const safeErrorMessage =
    error instanceof Error
      ? sanitizeValue("message", error.message)
      : "unknown";
  const safeStack =
    error instanceof Error && typeof error.stack === "string"
      ? sanitizeValue("stack", error.stack)
      : undefined;
  const safeCause =
    error instanceof Error && "cause" in error
      ? sanitizeValue("cause", (error as { cause?: unknown }).cause)
      : undefined;

  const apiResponse =
    error && typeof error === "object" && "response" in error
      ? sanitizeValue("response", (error as { response?: unknown }).response)
      : undefined;
  const apiStatus =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      operation,
      code,
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: safeErrorMessage,
      stack: safeStack,
      cause: safeCause,
      apiStatus,
      apiResponse,
      context: sanitizeContext(context),
    }),
  );
}
