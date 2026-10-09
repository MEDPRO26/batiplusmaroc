const ADMIN_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ADMIN_TIME_PATTERN = /^(\d{2}):(\d{2})$/;
type AdminVisitTime = { proposedDate: string; proposedTime: string };

/** Syntax accepted by the existing Admin conversion; scheduling validates separately. */
export function hasAdminVisitDateTimeFormat(visit: AdminVisitTime) {
  return ADMIN_DATE_PATTERN.test(visit.proposedDate) && ADMIN_TIME_PATTERN.test(visit.proposedTime);
}

/** Existing Admin wall-clock conversion, including its malformed-string fallback. */
export function adminVisitEpoch(visit: AdminVisitTime) {
  const date = ADMIN_DATE_PATTERN.exec(visit.proposedDate);
  const time = ADMIN_TIME_PATTERN.exec(visit.proposedTime);
  if (!date || !time) return null;
  const [year, month, day] = date.slice(1).map(Number);
  const [hour, minute] = time.slice(1).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    instant = target - (represented - instant);
  }
  return instant;
}
