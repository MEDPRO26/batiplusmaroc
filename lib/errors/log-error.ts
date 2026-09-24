import { getErrorCode } from "./parse-error";

type ErrorLogContext = Record<string, string | number | boolean | undefined>;

function summarize(error: unknown): Record<string, string> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 500),
    };
  }
  return { name: typeof error, message: String(error).slice(0, 500) };
}

export function logUnexpectedError(error: unknown, context: ErrorLogContext = {}): void {
  const code = getErrorCode(error);
  const summary = summarize(error);
  console.error("[batiplus]", {
    code,
    ...context,
    ...summary,
  });
}
