import { strings } from "@/i18n";
import { RESOURCE_CATEGORIES } from "@shared/types";

// The resource category labels must stay exhaustive over RESOURCE_CATEGORIES —
// a missing label would render `undefined` on a chip/card; an extra one is dead
// copy. Mirrors the event-category guard.
describe("resources category labels", () => {
  it("has a non-empty Polish label for every RESOURCE_CATEGORIES key", () => {
    for (const key of RESOURCE_CATEGORIES) {
      const label = strings.resources.categories[key];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("defines no extra labels beyond RESOURCE_CATEGORIES", () => {
    expect(Object.keys(strings.resources.categories).sort()).toEqual(
      [...RESOURCE_CATEGORIES].sort(),
    );
  });
});
