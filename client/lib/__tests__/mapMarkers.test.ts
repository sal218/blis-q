import { markersToFeatureCollection, pressedMarkerId } from "@/lib/mapMarkers";
import type { SafePlaceMarkerDTO } from "@shared/types";

const marker = (
  over: Partial<SafePlaceMarkerDTO> = {},
): SafePlaceMarkerDTO => ({
  id: "s1",
  name: "Tęczowa Kawiarnia",
  category: "cafe",
  latitude: 52.23,
  longitude: 21.01,
  ...over,
});

describe("markersToFeatureCollection", () => {
  it("makes one Point feature per marker with [lng, lat] order + id property", () => {
    const fc = markersToFeatureCollection([
      marker({ id: "a", latitude: 52.23, longitude: 21.01 }),
      marker({ id: "b", latitude: 50.06, longitude: 19.94 }),
    ]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    // [longitude, latitude] — x before y.
    expect(fc.features[0].geometry.coordinates).toEqual([21.01, 52.23]);
    expect(fc.features[0].properties.id).toBe("a");
    expect(fc.features[1].geometry.coordinates).toEqual([19.94, 50.06]);
    expect(fc.features[1].properties.id).toBe("b");
  });

  it("empty markers → an empty FeatureCollection", () => {
    expect(markersToFeatureCollection([])).toEqual({
      type: "FeatureCollection",
      features: [],
    });
  });
});

describe("pressedMarkerId", () => {
  it("reads the first feature's id property", () => {
    const id = pressedMarkerId({
      nativeEvent: { features: [{ properties: { id: "s7" } }] },
    });
    expect(id).toBe("s7");
  });

  it("returns null for a tap with no features / no id / null properties", () => {
    expect(pressedMarkerId({ nativeEvent: { features: [] } })).toBeNull();
    expect(pressedMarkerId({ nativeEvent: {} })).toBeNull();
    expect(pressedMarkerId({})).toBeNull();
    expect(
      pressedMarkerId({ nativeEvent: { features: [{ properties: null }] } }),
    ).toBeNull();
    expect(
      pressedMarkerId({
        nativeEvent: { features: [{ properties: { id: 5 } }] },
      }),
    ).toBeNull();
  });
});
