import { render, screen, fireEvent } from "@testing-library/react-native";
import { CategoryChip } from "@/components/CategoryChip";

describe("CategoryChip", () => {
  it("renders the label", () => {
    render(<CategoryChip label="Wsparcie" />);
    expect(screen.getByText("Wsparcie")).toBeTruthy();
  });

  it("without onPress it is a static pill, not a button", () => {
    render(<CategoryChip label="Wsparcie" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders with a category glyph without crashing", () => {
    render(<CategoryChip label="Sport" category="sports" />);
    expect(screen.getByText("Sport")).toBeTruthy();
  });

  it("with onPress it is a selectable button that fires onPress", () => {
    const onPress = jest.fn();
    render(<CategoryChip label="Wsparcie" selected onPress={onPress} />);
    const btn = screen.getByRole("button");
    expect(btn.props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
