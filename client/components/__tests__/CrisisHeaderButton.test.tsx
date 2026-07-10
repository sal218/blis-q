import { render, screen, fireEvent } from "@testing-library/react-native";
import { CrisisHeaderButton } from "@/components/CrisisHeaderButton";
import { strings } from "@/i18n";

// The shared crisis-help header button (P-37, slice 3b). Presentational: it must
// expose a button with the crisis a11y label and fire the supplied onPress. Each
// host screen owns the navigation, so the button knows nothing about routes.
describe("CrisisHeaderButton", () => {
  it("renders a button with the crisis-help a11y label", () => {
    render(<CrisisHeaderButton onPress={jest.fn()} />);
    expect(
      screen.getByRole("button", { name: strings.crisis.open }),
    ).toBeTruthy();
  });

  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    render(<CrisisHeaderButton onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: strings.crisis.open }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
