// Regression for the Expo Go boot crash (#102 → fix/map-lazy-expo-go).
// SafePlacesMapScreen imports @maplibre/maplibre-react-native, whose Camera
// TurboModule is checked at import-eval and is NOT bundled in Expo Go. AppTabs
// used to import that screen statically, so the whole app crashed at launch in
// Expo Go ("MLRNCameraModule could not be found"). AppTabs now loads the map
// screen lazily via getComponent, so nothing MapLibre evaluates at import.
//
// Simulate Expo Go by making the native map module THROW on evaluation; merely
// requiring AppTabs must still succeed (proving it doesn't statically pull in the
// map screen). If someone reintroduces a static import, this require throws.
jest.mock("@maplibre/maplibre-react-native", () => {
  throw new Error("MLRNCameraModule could not be found");
});
// Neutralize heavy leaf modules that throw at import for UNRELATED reasons when
// the whole AppTabs screen graph is required raw (Supabase needs env vars). We
// deliberately do NOT mock SafePlacesMapScreen — so if a static import of it is
// ever reintroduced, the real MapLibre (mocked to throw above) is pulled and
// this test fails, which is the point.
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("AppTabs boot", () => {
  it("does not evaluate the MapLibre map screen at import (boots in Expo Go)", () => {
    expect(() =>
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@/navigation/AppTabs");
      }),
    ).not.toThrow();
  });
});
