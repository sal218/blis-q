import { strings } from "@/i18n";
import { EVENT_CATEGORIES } from "@shared/types";

// Guard: every predefined event category must have a Polish label. If a future
// slice appends a key to EVENT_CATEGORIES without adding its label here, this
// fails instead of rendering `undefined` in the picker/chip (slice D2).
describe("event category labels (i18n)", () => {
  it("has a non-empty label for every EVENT_CATEGORIES key", () => {
    for (const key of EVENT_CATEGORIES) {
      const label = strings.events.categories[key];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("defines no extra category labels beyond EVENT_CATEGORIES", () => {
    expect(Object.keys(strings.events.categories).sort()).toEqual(
      [...EVENT_CATEGORIES].sort(),
    );
  });
});
