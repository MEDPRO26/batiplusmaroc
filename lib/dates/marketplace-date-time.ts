import moment from "moment-timezone/builds/moment-timezone-with-data-1970-2030";

export const MARKETPLACE_TIME_ZONE = "Africa/Casablanca";
export const MARKETPLACE_TZ_DATA_VERSION = moment.tz.dataVersion;

type MarketplaceDateTimeOptions = Omit<Intl.DateTimeFormatOptions, "timeZone">;

/**
 * Formats a UTC instant using Morocco's legal wall-clock time.
 *
 * moment-timezone supplies the IANA offset so this does not depend on the
 * host's potentially stale ICU timezone data. Native Intl still handles
 * localized EN/FR presentation, but only in UTC after the instant is shifted
 * by the verified Morocco offset.
 */
export function formatMarketplaceDateTime(
  timestamp: number | Date,
  locale: string,
  options: MarketplaceDateTimeOptions = {
    dateStyle: "medium",
    timeStyle: "medium",
  },
) {
  const instant = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  const offsetMinutes = moment.tz(instant, MARKETPLACE_TIME_ZONE).utcOffset();
  const moroccoWallClock = new Date(instant + offsetMinutes * 60_000);

  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(moroccoWallClock);
}
