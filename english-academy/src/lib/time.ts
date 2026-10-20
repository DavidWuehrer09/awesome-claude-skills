/**
 * Timezone helpers. All timestamps are stored as UTC instants; "today",
 * "due today" and reminder times are evaluated in the user's IANA timezone.
 * Implemented with Intl so daylight-saving transitions are handled by the
 * platform's tz database.
 */

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function localParts(instant: Date, tz: string): LocalParts {
  const parts = Object.fromEntries(formatter(tz).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset of `tz` from UTC at `instant`, in minutes (Berlin summer: +120). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant at which the local wall-clock time occurs in `tz`. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall - tzOffsetMinutes(new Date(wall), tz) * 60000;
  // Second pass corrects guesses that land on the other side of a DST switch.
  guess = wall - tzOffsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess);
}

export function localDateString(instant: Date, tz: string): string {
  const p = localParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** First instant of the next local day: anything due before it is "due today". */
export function endOfLocalDay(instant: Date, tz: string): Date {
  const p = localParts(instant, tz);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, tz);
}

export function startOfLocalDay(instant: Date, tz: string): Date {
  const p = localParts(instant, tz);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, tz);
}

export function localMinutesOfDay(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  return p.hour * 60 + p.minute;
}

export function parseHHMM(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`invalid time ${value}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`invalid time ${value}`);
  return h * 60 + min;
}

/** True if `minutes` lies in the (possibly overnight) window [start, end). */
export function inWindow(minutes: number, start: number, end: number): boolean {
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Whole days from now until a YYYY-MM-DD date (negative if past). */
export function daysUntil(date: string, now = new Date()): number {
  return Math.round((new Date(date).getTime() - now.getTime()) / 86400000);
}

export function localWeekday(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}
