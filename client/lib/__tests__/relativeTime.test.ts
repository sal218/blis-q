import {
  formatInboxTime,
  formatEventDateBadge,
  formatEventDateLong,
  formatEventTimeRange,
} from "@/lib/relativeTime";
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

// Local (no-Z) datetimes → getDay()/getHours() are timezone-independent.
describe("formatEventDateBadge", () => {
  it("returns the Polish weekday abbrev + day + month abbrev", () => {
    // 2026-07-04 is a Saturday in July → SOB / 4 / LIP.
    expect(formatEventDateBadge("2026-07-04T16:00:00")).toEqual({
      weekday: "SOB",
      day: "4",
      month: "LIP",
    });
    expect(formatEventDateBadge("2026-12-05T09:00:00")).toEqual({
      weekday: "SOB",
      day: "5",
      month: "GRU",
    });
  });

  it("invalid date → empty fields", () => {
    expect(formatEventDateBadge("nope")).toEqual({
      weekday: "",
      day: "",
      month: "",
    });
  });
});

describe("formatEventDateLong", () => {
  it("day + genitive month + year", () => {
    expect(formatEventDateLong("2026-07-04T16:00:00")).toBe("4 lipca 2026");
    expect(formatEventDateLong("2026-12-25T10:00:00")).toBe("25 grudnia 2026");
  });

  it("invalid date → empty string", () => {
    expect(formatEventDateLong("nope")).toBe("");
  });
});

describe("formatEventTimeRange", () => {
  it("start–end when there is an end time", () => {
    expect(
      formatEventTimeRange("2026-07-04T16:00:00", "2026-07-04T18:30:00"),
    ).toBe("16:00 – 18:30");
  });

  it("just the start when there is no end time", () => {
    expect(formatEventTimeRange("2026-07-04T16:05:00", null)).toBe("16:05");
  });

  it("invalid start → empty string", () => {
    expect(formatEventTimeRange("nope", null)).toBe("");
  });
});
