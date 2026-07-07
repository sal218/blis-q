import { render, screen, fireEvent } from "@testing-library/react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { strings } from "@/i18n";

describe("ScreenHeader", () => {
  it("renders the title and calls onBack when the back button is pressed", () => {
    const onBack = jest.fn();
    render(<ScreenHeader title="Zapisane" onBack={onBack} />);
    expect(screen.getByText("Zapisane")).toBeTruthy();
    fireEvent.press(screen.getByLabelText(strings.common.back));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders back-only (no title) without crashing", () => {
    const onBack = jest.fn();
    render(<ScreenHeader onBack={onBack} />);
    expect(screen.getByLabelText(strings.common.back)).toBeTruthy();
    expect(screen.queryByText("Zapisane")).toBeNull();
  });
});
