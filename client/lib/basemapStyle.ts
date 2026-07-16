// A minimal MapLibre style for the Safe Places map (P-40 SP-4b, slice 1).
//
// The basemap is a self-hosted Poland PMTiles file (Protomaps "basemaps" vector
// schema) read via MapLibre Native's built-in `pmtiles://` protocol — the URL
// must be FULLY QUALIFIED (pmtiles://https://host/poland.pmtiles) and the host
// must serve HTTP range requests. It is public OSM-derived map data, NOT user
// data (a documented exception to the no-public-buckets rule — CLAUDE.md §3).
//
// Deliberately minimal for the de-risk slice: land / water / landuse / roads /
// boundaries, LIGHT only, and NO text labels (a SymbolLayer needs a `glyphs`
// font endpoint — deferred so slice 1 makes no third-party font fetch). Place
// labels + a self-hosted glyphs URL + a dark variant + finer cartography are
// slice-2 polish. Our venue pins are drawn on top by the map screen.

import type { StyleSpecification } from "@maplibre/maplibre-react-native";

// The public https URL of the self-hosted Poland PMTiles basemap (set by the
// human before the device test). Kept behind a function so it is mockable in
// tests (EXPO_PUBLIC_* vars are inlined at build time, so they can't be toggled
// at runtime). Undefined in dev before provisioning → the map screen shows a
// "temporarily unavailable" notice instead of a broken native map.
export function getBasemapUrl(): string | undefined {
  return process.env.EXPO_PUBLIC_BASEMAP_URL;
}

const LAND = "#f6f5f1";
const EARTH = "#eeece6";
const GREEN = "#e3ebdd";
const WATER = "#a9c9ec";
const ROAD = "#dcdad2";
const BOUNDARY = "#c9c6bd";

// Build the MapLibre style for a given PMTiles URL. A pure function so it is
// trivial to unit-test (asserts the pmtiles:// source url) without a native map.
// Cast once: the hand-authored paint expressions are valid but wider than the
// strict style-spec union TypeScript infers from an object literal.
export function buildBasemapStyle(pmtilesUrl: string): StyleSpecification {
  const style = {
    version: 8,
    sources: {
      protomaps: {
        type: "vector",
        // MapLibre Native reads this natively; must be fully qualified.
        url: `pmtiles://${pmtilesUrl}`,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": LAND },
      },
      {
        id: "earth",
        type: "fill",
        source: "protomaps",
        "source-layer": "earth",
        paint: { "fill-color": EARTH },
      },
      {
        id: "landuse",
        type: "fill",
        source: "protomaps",
        "source-layer": "landuse",
        paint: { "fill-color": GREEN, "fill-opacity": 0.7 },
      },
      {
        id: "water",
        type: "fill",
        source: "protomaps",
        "source-layer": "water",
        paint: { "fill-color": WATER },
      },
      {
        id: "roads",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        paint: {
          "line-color": ROAD,
          // Thin at country zoom, wider as you zoom in.
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.4,
            12,
            2,
            16,
            6,
          ],
        },
      },
      {
        id: "boundaries",
        type: "line",
        source: "protomaps",
        "source-layer": "boundaries",
        paint: {
          "line-color": BOUNDARY,
          "line-width": 0.8,
          "line-dasharray": [3, 2],
        },
      },
    ],
  };
  return style as unknown as StyleSpecification;
}
