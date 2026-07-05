import { pl } from "./pl";

// i18n entry point. v1 ships a single locale (Polish, LTR). The indirection
// here is deliberate so adding a locale later is a new strings file + a map
// entry + (if ever needed) an RTL flag — screens import `strings`/`format` and
// never reference a locale directly. Arabic/RTL is intentionally NOT implemented
// in this branch (see docs/STATUS.md); this structure keeps it cheap to add.

export type Locale = "pl";
export type Strings = typeof pl;

export const DEFAULT_LOCALE: Locale = "pl";

// Per-locale metadata, including text direction — consumed by layout if/when a
// second (possibly RTL) locale is added. Polish is left-to-right.
export const LOCALE_META: Record<Locale, { isRTL: boolean }> = {
  pl: { isRTL: false },
};

const LOCALES: Record<Locale, Strings> = { pl };

// The active string set. Single export today; swap to a context/hook when a
// runtime locale switch becomes real.
export const strings: Strings = LOCALES[DEFAULT_LOCALE];

export function getStrings(locale: Locale = DEFAULT_LOCALE): Strings {
  return LOCALES[locale];
}

// Minimal token interpolation: format("za {seconds} s", { seconds: 30 }).
// Unknown tokens are left intact so missing vars are visible, not swallowed.
export function format(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

// Attendee count with correct Polish plural of "osoba" (person):
//   1 → "1 osoba idzie" · 2–4 → "N osoby idą" · 0/5+/teens → "N osób idzie".
export function goingLabel(count: number): string {
  const s = strings.events;
  if (count === 1) return s.goingOne;
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return format(s.goingFew, { count });
  }
  return format(s.goingMany, { count });
}

// Polish plural for the community member count ("1 członek" / "3 członkowie" /
// "5 członków"), mirroring goingLabel's few/many rules.
export function memberLabel(count: number): string {
  const s = strings.communities;
  if (count === 1) return s.memberOne;
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return format(s.memberFew, { count });
  }
  return format(s.memberMany, { count });
}
