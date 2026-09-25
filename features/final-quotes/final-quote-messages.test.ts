import { describe, expect, test } from "vitest";
import { APP_ERROR_CODES } from "@/lib/errors/codes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

function keys(value: Record<string, unknown>) {
  return Object.keys(value).sort();
}

describe("final quote translations", () => {
  test("keeps the complete EN and FR final quote shape aligned", () => {
    expect(keys(en.finalQuote)).toEqual(keys(fr.finalQuote));
    expect(keys(en.finalQuote.status)).toEqual(keys(fr.finalQuote.status));
  });

  test("maps every final quote backend error to safe translated copy", () => {
    const codes = APP_ERROR_CODES.filter((code) => code.includes("FINAL_QUOTE"));
    for (const code of codes) {
      expect(en.ux.error.codes).toHaveProperty(code);
      expect(fr.ux.error.codes).toHaveProperty(code);
    }
  });

  test("localizes every final quote marketplace activity event", () => {
    const events = ["final_quote_requested", "final_quote_submitted", "final_quote_changes_requested", "final_quote_revised", "final_quote_declined", "final_quote_withdrawn", "final_quote_accepted", "company_selected"] as const;
    for (const event of events) {
      expect(en.adminProjects.activity.events).toHaveProperty(event);
      expect(fr.adminProjects.activity.events).toHaveProperty(event);
      expect(en.adminSiteVisits.activity.events).toHaveProperty(event);
      expect(fr.adminSiteVisits.activity.events).toHaveProperty(event);
    }
  });
});
