import { render, screen } from "@testing-library/react-native";
import { RailSkeleton } from "@/components/skeleton/RailSkeleton";

describe("RailSkeleton", () => {
  it("renders the default 3 rail cards (in a scrollable rail)", () => {
    render(<RailSkeleton />);
    expect(screen.getByTestId("rail-skeleton")).toBeTruthy();
    // The cards are SkeletonBlocks (a11y-hidden), so include hidden elements.
    expect(
      screen.getAllByTestId("rail-skeleton-card", {
        includeHiddenElements: true,
      }),
    ).toHaveLength(3);
  });

  it("respects a custom count", () => {
    render(<RailSkeleton count={5} />);
    expect(
      screen.getAllByTestId("rail-skeleton-card", {
        includeHiddenElements: true,
      }),
    ).toHaveLength(5);
  });
});
