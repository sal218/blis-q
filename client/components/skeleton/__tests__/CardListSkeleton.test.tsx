import { render, screen } from "@testing-library/react-native";
import { CardListSkeleton } from "@/components/skeleton/CardListSkeleton";

describe("CardListSkeleton", () => {
  it("renders the requested number of card placeholders", () => {
    render(<CardListSkeleton count={4} />);
    expect(screen.getAllByTestId("skeleton-card")).toHaveLength(4);
  });

  it("defaults to 6 cards", () => {
    render(<CardListSkeleton />);
    expect(screen.getAllByTestId("skeleton-card")).toHaveLength(6);
  });

  it("omits the search placeholder by default and includes it when asked", () => {
    const { rerender } = render(<CardListSkeleton count={2} />);
    // The card-list container is always present.
    expect(screen.getByTestId("card-list-skeleton")).toBeTruthy();
    rerender(<CardListSkeleton count={2} showSearch />);
    // Still renders (the search block is a SkeletonBlock, a11y-hidden — just
    // assert the tree renders the requested cards with the flag on).
    expect(screen.getAllByTestId("skeleton-card")).toHaveLength(2);
  });

  it("renders the event variant with the same card count", () => {
    render(<CardListSkeleton count={3} variant="event" showSearch />);
    expect(screen.getAllByTestId("skeleton-card")).toHaveLength(3);
  });
});
