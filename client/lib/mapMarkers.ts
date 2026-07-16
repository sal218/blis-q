import type { SafePlaceMarkerDTO } from "@shared/types";

// Pure helpers for the Safe Places map (P-40 SP-4b). Kept out of the screen so
// the GeoJSON shape + the tap→id extraction are unit-testable without a native
// map. MapLibre/GeoJSON coordinates are [longitude, latitude] (x, y) order.

export type MarkerFeatureCollection = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { id: string; name: string; category: string };
  }[];
};

// One Point feature per marker; the venue id rides in `properties.id` so a pin
// tap can resolve back to the place (→ its detail screen).
export function markersToFeatureCollection(
  markers: SafePlaceMarkerDTO[],
): MarkerFeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers.map((m) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [m.longitude, m.latitude] },
      properties: { id: m.id, name: m.name, category: m.category },
    })),
  };
}

// Extract the tapped venue id from a MapLibre source press event. The native
// GeoJSONSource onPress delivers the hit features under `nativeEvent.features`;
// we read the first feature's `id` property. Returns null if absent (defensive —
// a stray tap with no feature must not navigate). Typed loosely because a
// GeoJSON `Feature.properties` may be null.
export function pressedMarkerId(event: {
  nativeEvent?: {
    features?: ReadonlyArray<{
      properties?: { [key: string]: unknown } | null;
    }>;
  };
}): string | null {
  const id = event?.nativeEvent?.features?.[0]?.properties?.id;
  return typeof id === "string" ? id : null;
}
