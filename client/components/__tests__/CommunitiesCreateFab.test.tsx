jest.mock("@react-navigation/bottom-tabs", () => ({
  useBottomTabBarHeight: () => 60,
}));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { CommunitiesCreateFab } from "@/components/CommunitiesCreateFab";
import { strings } from "@/i18n";

describe("CommunitiesCreateFab", () => {
  it("reveals the options only after the FAB is opened", () => {
    render(
      <CommunitiesCreateFab
        onCreateCommunity={jest.fn()}
        onCreateEvent={jest.fn()}
      />,
    );

    // Closed: the option actions are not present.
    expect(screen.queryByTestId("fab-create-community")).toBeNull();
    expect(screen.queryByTestId("fab-create-event")).toBeNull();

    fireEvent.press(screen.getByTestId("communities-fab"));

    // Open: both options are shown.
    expect(screen.getByTestId("fab-create-community")).toBeTruthy();
    expect(screen.getByTestId("fab-create-event")).toBeTruthy();
  });

  it("fires the correct action for each option", () => {
    const onCreateCommunity = jest.fn();
    const onCreateEvent = jest.fn();
    render(
      <CommunitiesCreateFab
        onCreateCommunity={onCreateCommunity}
        onCreateEvent={onCreateEvent}
      />,
    );

    fireEvent.press(screen.getByTestId("communities-fab"));
    fireEvent.press(screen.getByTestId("fab-create-community"));
    expect(onCreateCommunity).toHaveBeenCalledTimes(1);

    // Menu closes after an action; reopen for the second option.
    fireEvent.press(screen.getByTestId("communities-fab"));
    fireEvent.press(screen.getByTestId("fab-create-event"));
    expect(onCreateEvent).toHaveBeenCalledTimes(1);
  });

  it("closes via the backdrop / close button without firing an action", () => {
    const onCreateCommunity = jest.fn();
    const onCreateEvent = jest.fn();
    render(
      <CommunitiesCreateFab
        onCreateCommunity={onCreateCommunity}
        onCreateEvent={onCreateEvent}
      />,
    );

    fireEvent.press(screen.getByTestId("communities-fab"));
    fireEvent.press(screen.getByTestId("communities-fab-close"));

    expect(screen.queryByTestId("fab-create-community")).toBeNull();
    expect(onCreateCommunity).not.toHaveBeenCalled();
    expect(onCreateEvent).not.toHaveBeenCalled();
  });

  it("uses Polish labels for the two options", () => {
    render(
      <CommunitiesCreateFab
        onCreateCommunity={jest.fn()}
        onCreateEvent={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId("communities-fab"));
    expect(screen.getByText(strings.communities.createEvent)).toBeTruthy();
    expect(screen.getByText(strings.communities.create)).toBeTruthy();
  });
});
