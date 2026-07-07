// SavedScreen hosts a 2-tab control over saved events + saved safe places.
// The two lists are stubbed so this stays a pure wiring test (default = Events;
// switching the segment renders the safe-places list).
jest.mock("@/screens/events/SavedEventsList", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native");
  return { SavedEventsList: () => <Text testID="saved-events-list">e</Text> };
});
jest.mock("@/screens/events/SavedSafePlacesList", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native");
  return {
    SavedSafePlacesList: () => <Text testID="saved-places-list">p</Text>,
  };
});

import { render, screen, fireEvent } from "@testing-library/react-native";
import { SavedScreen } from "@/screens/events/SavedScreen";
import { strings } from "@/i18n";

function renderScreen() {
  const goBack = jest.fn();
  const navigation = { navigate: jest.fn(), goBack } as unknown as never;
  const route = { params: undefined } as unknown as never;
  render(<SavedScreen navigation={navigation} route={route} />);
  return { goBack };
}

describe("SavedScreen — 2-tab saved view", () => {
  it("defaults to the Events tab", () => {
    renderScreen();
    expect(screen.getByTestId("saved-events-list")).toBeTruthy();
    expect(screen.queryByTestId("saved-places-list")).toBeNull();
  });

  it("renders its own header title + a back button (full-bleed)", () => {
    const { goBack } = renderScreen();
    expect(screen.getByText(strings.saved.title)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(strings.common.back));
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it("switches to the Safe places tab", () => {
    renderScreen();
    fireEvent.press(screen.getByText(strings.saved.tabSafePlaces));
    expect(screen.getByTestId("saved-places-list")).toBeTruthy();
    expect(screen.queryByTestId("saved-events-list")).toBeNull();
  });
});
