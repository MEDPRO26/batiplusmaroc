import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import fr from "../../messages/fr.json";
import en from "../../messages/en.json";
import { getErrorCode, looksLikeTechnicalError, mapAppError, type AppErrorMessageKey } from "./index";

const frT = (key: AppErrorMessageKey) => {
  if (key === "error.generic") return fr.ux.error.generic;
  if (key === "offline") return fr.ux.offline;
  if (key.startsWith("error.codes.")) {
    const code = key.replace("error.codes.", "") as keyof typeof fr.ux.error.codes;
    return fr.ux.error.codes[code];
  }
  throw new Error(`missing ${key}`);
};

const enT = (key: AppErrorMessageKey) => {
  if (key === "error.generic") return en.ux.error.generic;
  if (key === "offline") return en.ux.offline;
  if (key.startsWith("error.codes.")) {
    const code = key.replace("error.codes.", "") as keyof typeof en.ux.error.codes;
    return en.ux.error.codes[code];
  }
  throw new Error(`missing ${key}`);
};

describe("mapAppError", () => {
  test("maps known backend codes to friendly FR/EN messages", () => {
    const error = new ConvexError("INVALID_ACCOUNT_TYPE");
    expect(getErrorCode(error)).toBe("INVALID_ACCOUNT_TYPE");
    expect(mapAppError(error, frT)).toBe("Ce type de compte n’est pas autorisé.");
    expect(mapAppError(error, enT)).toBe("This account type is not allowed.");
    expect(mapAppError(new ConvexError("INVALID_SERVICE_AREAS"), frT)).toBe(
      "Sélectionnez au moins une zone d’intervention valide.",
    );
    expect(mapAppError(new ConvexError("INVALID_LANGUAGES"), enT)).toBe(
      "Select at least one valid language.",
    );
  });

  test("unknown errors use the generic fallback and never leak stacks", () => {
    const error = new Error("ConvexError: boom\n    at handler (convex/users.ts:12:3)\nId js1234567890abcdef");
    const frMessage = mapAppError(error, frT, { logUnknown: false });
    const enMessage = mapAppError(error, enT, { logUnknown: false });
    expect(frMessage).toBe("Une erreur est survenue. Veuillez réessayer.");
    expect(enMessage).toBe("Something went wrong. Please try again.");
    expect(looksLikeTechnicalError(frMessage)).toBe(false);
    expect(looksLikeTechnicalError(enMessage)).toBe(false);
    expect(looksLikeTechnicalError(error.message)).toBe(true);
  });

  test("network failures map to the connection copy", () => {
    expect(mapAppError(new TypeError("Failed to fetch"), frT)).toBe(
      "Problème de connexion. Nous allons réessayer.",
    );
    expect(mapAppError(new TypeError("Failed to fetch"), enT)).toBe(
      "Connection problem. We’ll try again.",
    );
  });
});
