import { describe, expect, test } from "vitest";
import {
  formatMarketplaceDateTime,
  MARKETPLACE_TZ_DATA_VERSION,
} from "./marketplace-date-time";

const timeOnly = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
} as const;

describe("Morocco marketplace date formatting", () => {
  test("uses bundled IANA timezone data newer than the Morocco 2026 change", () => {
    expect(MARKETPLACE_TZ_DATA_VERSION).toBe("2026d");
  });

  test.each(["en-GB", "fr-FR"])(
    "renders Sep 25, 2026 in permanent UTC for %s",
    (locale) => {
      expect(
        formatMarketplaceDateTime(
          new Date("2026-09-25T15:40:00Z"),
          locale,
          timeOnly,
        ),
      ).toBe("15:40");
    },
  );

  test.each(["en-GB", "fr-FR"])(
    "preserves Morocco UTC+1 before Sep 20, 2026 for %s",
    (locale) => {
      expect(
        formatMarketplaceDateTime(
          new Date("2026-09-10T15:40:00Z"),
          locale,
          timeOnly,
        ),
      ).toBe("16:40");
    },
  );
});
