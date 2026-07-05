jest.mock("@react-navigation/bottom-tabs", () => ({
  useBottomTabBarHeight: () => 60,
}));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { CommunitiesCreateFab } from "@/components/CommunitiesCreateFab";
import { strings } from "@/i18n";

describe("CommunitiesCreateFab", () => {
  it("hides the options from the a11y tree until the FAB is opened", () => {
    render(
      <CommunitiesCreateFab
        onCreateCommunity={jest.fn()}
        onCreateEvent={jest.fn()}
      />,
    );

    // Collapsed: hidden from the a11y tree (query it via includeHiddenElements).
    const wrapper = screen.getByTestId("fab-create-community-wrapper", {
      includeHiddenElements: true,
    });
    expect(wrapper.props.accessibilityElementsHidden).toBe(true);
    expect(wrapper.props.importantForAccessibility).toBe("no-hide-descendants");

    fireEvent.press(screen.getByTestId("communities-fab"));

    // Expanded: exposed again (now discoverable without the hidden flag).
    const openWrapper = screen.getByTestId("fab-create-community-wrapper");
    expect(openWrapper.props.accessibilityElementsHidden).toBe(false);
    expect(openWrapper.props.importantForAccessibility).toBe("auto");
  });

  it("fires the correct action for each option once open", () => {
    const onCreateCommunity = jest.fn();
    const onCreateEvent = jest.fn();
    render(
      <CommunitiesCreateFab
        onCreateCommunity={onCreateCommunity}
        onCreateEvent={onCreateEvent}
      />,
    );

    fireEvent.press(screen.getByTestId("communities-fab"));
    fireEvent.press(
      screen.getByRole("button", { name: strings.communities.create }),
    );
    expect(onCreateCommunity).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId("communities-fab"));
    fireEvent.press(
      screen.getByRole("button", { name: strings.communities.createEvent }),
    );
    expect(onCreateEvent).toHaveBeenCalledTimes(1);
  });
});
