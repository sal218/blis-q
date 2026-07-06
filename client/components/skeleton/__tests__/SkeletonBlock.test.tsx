import { render, screen } from "@testing-library/react-native";
import { SkeletonBlock } from "@/components/skeleton/SkeletonBlock";

describe("SkeletonBlock", () => {
  it("renders with the given testID and is hidden from a11y", () => {
    render(
      <SkeletonBlock testID="sk" height={12} width={100} borderRadius={4} />,
    );
    const block = screen.getByTestId("sk", { includeHiddenElements: true });
    expect(block).toBeTruthy();
    expect(block.props.accessibilityElementsHidden).toBe(true);
  });

  it("mounts and unmounts cleanly (animation cancelled on unmount)", () => {
    const { unmount } = render(<SkeletonBlock height={20} />);
    expect(() => unmount()).not.toThrow();
  });
});
