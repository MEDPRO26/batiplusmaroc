import { mapAppError, type AppErrorMessageKey } from "@/lib/errors";

export function mapAuthError(error: unknown, t: (key: AppErrorMessageKey) => string) {
  return mapAppError(error, (key) => t(key));
}
