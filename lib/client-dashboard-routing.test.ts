import { describe, expect, test } from "vitest";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";

describe("localized client dashboard routing", () => {
  test("keeps the legacy client root and canonical dashboard paths distinct", () => {
    expect(routing.pathnames[routes.clientRoot]).toEqual({ en: "/client", fr: "/espace-client" });
    expect(routing.pathnames[routes.clientDashboard]).toEqual({
      en: "/client/dashboard",
      fr: "/espace-client/tableau-de-bord",
    });
  });
});
