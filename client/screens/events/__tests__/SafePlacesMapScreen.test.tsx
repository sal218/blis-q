// Mock the native map module: render lightweight stubs so the screen mounts in
// jsdom/RN-test without the native renderer. GeoJSONSource forwards its onPress
// (so we can simulate a pin tap) and renders its children.
jest.mock("@maplibre/maplibre-react-native", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    Map: ({ children, testID }: { children?: unknown; testID?: string }) => (
      <View testID={testID}>{children as never}</View>
    ),
    Camera: () => null,
    GeoJSONSource: ({
      children,
      onPress,
    }: {
      children?: unknown;
      onPress?: (e: unknown) => void;
    }) => (
      <View testID="map-source" onPress={onPress}>
        {children as never}
      </View>
    ),
    Layer: () => null,
  };
});

// Control the basemap URL (normally an inlined EXPO_PUBLIC_ var).
jest.mock("@/lib/basemapStyle", () => ({
  ...jest.requireActual("@/lib/basemapStyle"),
  getBasemapUrl: jest.fn(),
}));

jest.mock("@/hooks/useSafePlaceMarkers", () => ({
  useSafePlaceMarkers: jest.fn(),
}));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { SafePlacesMapScreen } from "@/screens/events/SafePlacesMapScreen";
import { useSafePlaceMarkers } from "@/hooks/useSafePlaceMarkers";
import { getBasemapUrl } from "@/lib/basemapStyle";
import { strings } from "@/i18n";
import type { SafePlaceMarkerDTO } from "@shared/types";

const markersMock = useSafePlaceMarkers as unknown as jest.Mock;
const urlMock = getBasemapUrl as unknown as jest.Mock;

const MARKERS: SafePlaceMarkerDTO[] = [
  { id: "s1", name: "A", category: "cafe", latitude: 52.2, longitude: 21.0 },
];

function renderScreen(
  over: Partial<ReturnType<typeof useSafePlaceMarkers>> = {},
): { navigate: jest.Mock; goBack: jest.Mock } {
  markersMock.mockReturnValue({
    markers: MARKERS,
    status: "ready" as const,
    retry: jest.fn(),
    ...over,
  });
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  render(
    <SafePlacesMapScreen
      navigation={navigation as never}
      route={{ params: undefined } as never}
    />,
  );
  return navigation;
}

beforeEach(() => {
  markersMock.mockReset();
  urlMock.mockReset();
  urlMock.mockReturnValue("https://cdn.example/poland.pmtiles");
});

describe("SafePlacesMapScreen", () => {
  it("renders the map + the OSM attribution when configured", () => {
    renderScreen();
    expect(screen.getByTestId("safe-places-map")).toBeTruthy();
    expect(screen.getByText(strings.safePlaces.map.attribution)).toBeTruthy();
  });

  it("tapping a pin opens that place's detail", () => {
    const nav = renderScreen();
    fireEvent(screen.getByTestId("map-source"), "press", {
      nativeEvent: { features: [{ properties: { id: "s1" } }] },
    });
    expect(nav.navigate).toHaveBeenCalledWith("SafePlaceDetail", { id: "s1" });
  });

  it("a tap with no feature does not navigate", () => {
    const nav = renderScreen();
    fireEvent(screen.getByTestId("map-source"), "press", {
      nativeEvent: { features: [] },
    });
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it("shows the 'unavailable' notice when no basemap URL is configured", () => {
    urlMock.mockReturnValue(undefined);
    renderScreen();
    expect(screen.getByText(strings.safePlaces.map.unavailable)).toBeTruthy();
    expect(screen.queryByTestId("safe-places-map")).toBeNull();
  });

  it("error state → load error + a retry", () => {
    const retry = jest.fn();
    renderScreen({ markers: [], status: "error", retry });
    expect(screen.getByText(strings.safePlaces.map.loadError)).toBeTruthy();
    fireEvent.press(screen.getByText(strings.safePlaces.retry));
    expect(retry).toHaveBeenCalled();
  });

  it("ready + zero markers → the empty notice (map still shown)", () => {
    renderScreen({ markers: [], status: "ready" });
    expect(screen.getByTestId("safe-places-map")).toBeTruthy();
    expect(screen.getByText(strings.safePlaces.map.empty)).toBeTruthy();
  });

  it("the back button goes back", () => {
    const nav = renderScreen();
    fireEvent.press(
      screen.getByRole("button", { name: strings.safePlaces.map.back }),
    );
    expect(nav.goBack).toHaveBeenCalled();
  });
});
