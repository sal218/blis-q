import {
  validateEventTitle,
  validateEventDescription,
  validateEventLocation,
  validateEventDates,
  EVENT_TITLE_MAX,
  EVENT_TEXT_MAX,
} from "@/validation/events";

describe("validateEventTitle", () => {
  it("empty / whitespace → titleRequired", () => {
    expect(validateEventTitle("")).toEqual({ code: "titleRequired" });
    expect(validateEventTitle("   ")).toEqual({ code: "titleRequired" });
  });

  it("over the max → titleTooLong", () => {
    expect(validateEventTitle("a".repeat(EVENT_TITLE_MAX + 1))).toEqual({
      code: "titleTooLong",
      max: EVENT_TITLE_MAX,
    });
  });

  it("valid → null", () => {
    expect(validateEventTitle("  Spotkanie  ")).toBeNull();
  });
});

describe("validateEventDescription / validateEventLocation", () => {
  it("over the max → tooLong", () => {
    expect(validateEventDescription("a".repeat(EVENT_TEXT_MAX + 1))).toEqual({
      code: "descriptionTooLong",
      max: EVENT_TEXT_MAX,
    });
    expect(validateEventLocation("a".repeat(EVENT_TEXT_MAX + 1))).toEqual({
      code: "locationTooLong",
      max: EVENT_TEXT_MAX,
    });
  });

  it("within bounds (incl. empty) → null", () => {
    expect(validateEventDescription("")).toBeNull();
    expect(validateEventLocation("Warszawa")).toBeNull();
  });
});

describe("validateEventDates", () => {
  const start = new Date("2026-07-04T16:00:00");

  it("end == start or end < start → endBeforeStart", () => {
    expect(validateEventDates(start, new Date("2026-07-04T16:00:00"))).toEqual({
      code: "endBeforeStart",
    });
    expect(validateEventDates(start, new Date("2026-07-04T15:00:00"))).toEqual({
      code: "endBeforeStart",
    });
  });

  it("end > start → null", () => {
    expect(
      validateEventDates(start, new Date("2026-07-04T18:00:00")),
    ).toBeNull();
  });

  it("no end → null", () => {
    expect(validateEventDates(start, null)).toBeNull();
  });
});
