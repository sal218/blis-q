// The Events tab's "Safe places" segment must render the SafePlacesList (SP-3),
// NOT the old "coming soon" stub. Child sections are stubbed so this stays a
// pure wiring test (no data fetching).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/screens/events/EventsList", () => ({
  EventsList: () => null,
}));
jest.mock("@/screens/communities/CommunitiesSection", () => ({
  CommunitiesSection: () => null,
}));
jest.mock("@/screens/events/SafePlacesList", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native");
  // Expose onOpenMap on the stub so the map-entry guard is testable: pressing
  // the stub invokes onOpenMap (the same handler the real "Zobacz na mapie"
  // entry calls).
  return {
    SafePlacesList: (props: { onOpenMap?: () => void }) => (
      <Text testID="safe-places-list" onPress={props.onOpenMap}>
        list
      </Text>
    ),
  };
});
jest.mock("@/lib/expoGo", () => ({ isExpoGo: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";
import { EventsScreen } from "@/screens/events/EventsScreen";
import { isExpoGo } from "@/lib/expoGo";
import { strings } from "@/i18n";

const isExpoGoMock = isExpoGo as unknown as jest.Mock;

function renderScreen() {
  const navigate = jest.fn();
  const navigation = { navigate } as unknown as never;
  const route = { params: undefined } as unknown as never;
  render(<EventsScreen navigation={navigation} route={route} />);
  return { navigate };
}

// Switch to the "Bezpieczne miejsca" (Safe places) segment so SafePlacesList
// (and thus its map entry) is mounted.
function openSafePlacesSegment() {
  fireEvent.press(screen.getByText(strings.events.tabSafePlaces));
}

beforeEach(() => isExpoGoMock.mockReturnValue(false));

describe("EventsScreen — Safe places segment", () => {
  it("renders SafePlacesList (not the ComingSoon stub) on the Safe places tab", () => {
    renderScreen();
    // Switch to the "Bezpieczne miejsca" segment.
    fireEvent.press(screen.getByText(strings.events.tabSafePlaces));
    expect(screen.getByTestId("safe-places-list")).toBeTruthy();
    expect(screen.queryByText(strings.events.safePlacesComingSoon)).toBeNull();
  });
});

describe("EventsScreen — crisis-help button", () => {
  it("cross-navigates to the Resources/Crisis screen", () => {
    const { navigate } = renderScreen();
    fireEvent.press(screen.getByRole("button", { name: strings.crisis.open }));
    expect(navigate).toHaveBeenCalledWith("Resources", {
      screen: "Crisis",
      initial: false,
    });
  });
});

describe("EventsScreen — map entry (Expo Go guard)", () => {
  it("in Expo Go: shows the dev-build alert and does NOT navigate to the map", () => {
    isExpoGoMock.mockReturnValue(true);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { navigate } = renderScreen();
    openSafePlacesSegment();
    fireEvent.press(screen.getByTestId("safe-places-list")); // = onOpenMap
    expect(alertSpy).toHaveBeenCalledWith(
      strings.safePlaces.map.devBuildTitle,
      strings.safePlaces.map.devBuildBody,
    );
    expect(navigate).not.toHaveBeenCalledWith("SafePlacesMap");
    alertSpy.mockRestore();
  });

  it("in a dev build: navigates to the full-screen map", () => {
    isExpoGoMock.mockReturnValue(false);
    const { navigate } = renderScreen();
    openSafePlacesSegment();
    fireEvent.press(screen.getByTestId("safe-places-list"));
    expect(navigate).toHaveBeenCalledWith("SafePlacesMap");
  });
});
