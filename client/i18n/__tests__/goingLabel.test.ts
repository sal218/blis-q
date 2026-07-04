import { goingLabel } from "@/i18n";

// Polish plural of "osoba" (person): 1 → osoba, 2–4 → osoby, 0/5+/teens → osób.
describe("goingLabel (attendee count, Polish plural)", () => {
  it("uses the singular for exactly one", () => {
    expect(goingLabel(1)).toBe("1 osoba idzie");
  });

  it("uses the few-form for 2–4 (but not the teens)", () => {
    expect(goingLabel(2)).toBe("2 osoby idą");
    expect(goingLabel(3)).toBe("3 osoby idą");
    expect(goingLabel(24)).toBe("24 osoby idą");
  });

  it("uses the many-form for 0, 5+, and the teens", () => {
    expect(goingLabel(0)).toBe("0 osób idzie");
    expect(goingLabel(5)).toBe("5 osób idzie");
    expect(goingLabel(12)).toBe("12 osób idzie");
    expect(goingLabel(13)).toBe("13 osób idzie");
    expect(goingLabel(46)).toBe("46 osób idzie");
  });
});
