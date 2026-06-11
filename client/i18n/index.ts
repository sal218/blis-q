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
