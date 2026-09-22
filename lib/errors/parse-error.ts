import { findKnownCodeInText, isAppErrorCode, type AppErrorCode } from "./codes";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function collectErrorText(error: unknown): string {
  if (error instanceof Error) {
    const data =
      "data" in error ? (error as Error & { data?: unknown }).data : undefined;
    return [error.name, error.message, typeof data === "string" ? data : ""].join(" ");
  }
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

function readDataCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = (error as { data: unknown }).data;
  const asString = readString(data);
  if (asString) return asString;
  if (data && typeof data === "object" && "code" in data) {
    return readString((data as { code: unknown }).code);
  }
  return null;
}

function isNetworkFailure(text: string): boolean {
  return /failed to fetch|networkerror|load failed|network request failed|err_network|econn|offline|connection (lost|failed|refused)/i.test(
    text,
  );
}

function isInvalidCredentials(text: string): boolean {
  return /InvalidAccountId|InvalidSecret|Invalid password|invalid credentials/i.test(text);
}

function isAccountExists(text: string): boolean {
  return /already exists|Account already exists/i.test(text);
}

export function getErrorCode(error: unknown): AppErrorCode {
  const dataCode = readDataCode(error);
  if (dataCode && isAppErrorCode(dataCode)) return dataCode;
  if (dataCode) {
    const nested = findKnownCodeInText(dataCode);
    if (nested) return nested;
  }

  const text = collectErrorText(error);
  const fromText = findKnownCodeInText(text);
  if (fromText) return fromText;
  if (isNetworkFailure(text)) return "NETWORK";
  if (isInvalidCredentials(text)) return "INVALID_CREDENTIALS";
  if (isAccountExists(text)) return "ACCOUNT_EXISTS";
  return "UNKNOWN";
}

const technicalLeakPattern =
  /ConvexError|at\s+\S+\s+\(|\/convex\/|_generated|stack trace|TypeError|ReferenceError|j[a-z0-9]{16,}|[0-9a-f]{24,}/i;

export function looksLikeTechnicalError(message: string): boolean {
  return technicalLeakPattern.test(message);
}
