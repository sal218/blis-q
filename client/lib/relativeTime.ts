import { strings, format } from "@/i18n";

// Minimal relative-time formatter for feed timestamps (Polish). Abbreviated units
// ("min", "godz.", "dni") sidestep Polish plural rules. Anything a week or older
// falls back to a short absolute date so the label stays meaningful. `now` is
// injectable for deterministic tests.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(
  iso: string,
  now: number = Date.now(),
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diff = now - then;
  if (diff < MINUTE) return strings.posts.timeNow;
  if (diff < HOUR) {
    return format(strings.posts.timeMinutes, {
      count: Math.floor(diff / MINUTE),
    });
  }
  if (diff < DAY) {
    return format(strings.posts.timeHours, { count: Math.floor(diff / HOUR) });
  }
  if (diff < 7 * DAY) {
    return format(strings.posts.timeDays, { count: Math.floor(diff / DAY) });
  }
  // A week or older → short absolute date (e.g. "12.05.2026").
  const d = new Date(then);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// WhatsApp-style timestamp for the Messages inbox: same calendar day → "HH:MM",
// yesterday → "Wczoraj", older → "DD.MM.YYYY". Distinct from formatRelativeTime
// (the feed's "5 min temu" style). `now` injectable for deterministic tests.
export function formatInboxTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const d = new Date(then);
  const pad = (n: number) => String(n).padStart(2, "0");
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const nowDate = new Date(now);
  if (sameDay(d, nowDate)) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return strings.chat.yesterday;

  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// Polish uppercase weekday abbreviations, indexed by Date.getDay() (0 = Sunday).
const PL_WEEKDAYS = ["NDZ", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];

// Event-card date badge: the weekday abbreviation + day-of-month (e.g. SOB / 24).
// Pure (no `now`); an invalid date yields empty strings so the badge stays blank
// rather than rendering "NaN".
export function formatEventDateBadge(iso: string): {
  weekday: string;
  day: string;
} {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { weekday: "", day: "" };
  return { weekday: PL_WEEKDAYS[d.getDay()], day: String(d.getDate()) };
}

// Event time range: "16:00 – 18:00", or just "16:00" when there is no end time.
// Invalid start → "" (the screen falls back to a "time TBA"-style label).
export function formatEventTimeRange(
  startIso: string,
  endIso: string | null,
): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const startLabel = hhmm(start);
  if (!endIso) return startLabel;
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return startLabel;
  return `${startLabel} – ${hhmm(end)}`;
}
