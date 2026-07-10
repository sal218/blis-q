import { strings } from "@/i18n";
import { CRISIS_CONTACT_CATEGORIES } from "@shared/types";

// The crisis category labels must stay exhaustive over CRISIS_CONTACT_CATEGORIES —
// a missing label would render `undefined` on a chip; an extra one is dead copy.
// Mirrors the resource/event category guards.
describe("crisis category labels", () => {
  it("has a non-empty Polish label for every CRISIS_CONTACT_CATEGORIES key", () => {
    for (const key of CRISIS_CONTACT_CATEGORIES) {
      const label = strings.crisis.categories[key];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("defines no extra labels beyond CRISIS_CONTACT_CATEGORIES", () => {
    expect(Object.keys(strings.crisis.categories).sort()).toEqual(
      [...CRISIS_CONTACT_CATEGORIES].sort(),
    );
  });
});
