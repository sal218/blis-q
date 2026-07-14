import { strings } from "@/i18n";
import { NEWS_CATEGORIES } from "@shared/types";

// The news category labels must stay exhaustive over NEWS_CATEGORIES — a missing
// label would render `undefined` on a chip/card; an extra one is dead copy.
// Mirrors the resource/event-category guards.
describe("news category labels", () => {
  it("has a non-empty Polish label for every NEWS_CATEGORIES key", () => {
    for (const key of NEWS_CATEGORIES) {
      const label = strings.news.categories[key];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("defines no extra labels beyond NEWS_CATEGORIES", () => {
    expect(Object.keys(strings.news.categories).sort()).toEqual(
      [...NEWS_CATEGORIES].sort(),
    );
  });
});
