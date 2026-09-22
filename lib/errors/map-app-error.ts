import { ERROR_FIELD_BY_CODE, type AppErrorCode } from "./codes";
import { getErrorCode } from "./parse-error";
import { logUnexpectedError } from "./log-error";

export type AppErrorMessageKey = `error.codes.${AppErrorCode}` | "error.generic" | "offline";

export type AppErrorTranslation = {
  code: AppErrorCode;
  field: string | undefined;
  messageKey: AppErrorMessageKey;
};

export function describeAppError(error: unknown, options?: { logUnknown?: boolean }): AppErrorTranslation {
  const code = getErrorCode(error);
  if (options?.logUnknown !== false && code === "UNKNOWN") {
    logUnexpectedError(error, { code });
  }

  const messageKey: AppErrorMessageKey =
    code === "NETWORK" ? "offline" : code === "UNKNOWN" ? "error.generic" : `error.codes.${code}`;

  return {
    code,
    field: ERROR_FIELD_BY_CODE[code],
    messageKey,
  };
}

export function mapAppError(
  error: unknown,
  t: (key: AppErrorMessageKey) => string,
  options?: { logUnknown?: boolean },
): string {
  const described = describeAppError(error, options);
  return t(described.messageKey);
}

export function mapConvexFailure(
  error: unknown,
  t: (key: AppErrorMessageKey) => string,
): { code: AppErrorCode; field: string | undefined; message: string } {
  const described = describeAppError(error);
  return {
    code: described.code,
    field: described.field,
    message: t(described.messageKey),
  };
}
