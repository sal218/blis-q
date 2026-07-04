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
  return { SafePlacesList: () => <Text testID="safe-places-list">list</Text> };
});

import { render, screen, fireEvent } from "@testing-library/react-native";
import { EventsScreen } from "@/screens/events/EventsScreen";
import { strings } from "@/i18n";

function renderScreen() {
  const navigation = { navigate: jest.fn() } as unknown as never;
  const route = { params: undefined } as unknown as never;
  render(<EventsScreen navigation={navigation} route={route} />);
}

describe("EventsScreen — Safe places segment", () => {
  it("renders SafePlacesList (not the ComingSoon stub) on the Safe places tab", () => {
    renderScreen();
    // Switch to the "Bezpieczne miejsca" segment.
    fireEvent.press(screen.getByText(strings.events.tabSafePlaces));
    expect(screen.getByTestId("safe-places-list")).toBeTruthy();
    expect(screen.queryByText(strings.events.safePlacesComingSoon)).toBeNull();
  });
});
