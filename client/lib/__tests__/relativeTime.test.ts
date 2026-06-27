import { formatInboxTime } from "@/lib/relativeTime";
import { strings } from "@/i18n";

// Use timezone-independent local date strings (no trailing "Z") so getHours()
// and the same-day comparison are deterministic regardless of the runner's TZ.
const NOW = new Date("2026-06-15T12:00:00").getTime();

describe("formatInboxTime", () => {
  it("same calendar day → HH:MM (zero-padded)", () => {
    expect(formatInboxTime("2026-06-15T09:05:00", NOW)).toBe("09:05");
    expect(formatInboxTime("2026-06-15T23:30:00", NOW)).toBe("23:30");
  });

  it("yesterday → the localized 'Wczoraj'", () => {
    expect(formatInboxTime("2026-06-14T20:00:00", NOW)).toBe(
      strings.chat.yesterday,
    );
  });

  it("older than yesterday → DD.MM.YYYY", () => {
    expect(formatInboxTime("2026-06-01T10:00:00", NOW)).toBe("01.06.2026");
    expect(formatInboxTime("2025-12-31T10:00:00", NOW)).toBe("31.12.2025");
  });

  it("invalid date → empty string", () => {
    expect(formatInboxTime("not-a-date", NOW)).toBe("");
  });
});
