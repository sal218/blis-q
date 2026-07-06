jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { render, screen } from "@testing-library/react-native";
import { ChatInboxSkeleton } from "@/components/skeleton/ChatInboxSkeleton";

describe("ChatInboxSkeleton", () => {
  it("renders the default 7 avatar rows under a header", () => {
    render(<ChatInboxSkeleton />);
    expect(screen.getByTestId("chat-inbox-skeleton")).toBeTruthy();
    expect(screen.getAllByTestId("chat-inbox-skeleton-row")).toHaveLength(7);
  });

  it("respects a custom count", () => {
    render(<ChatInboxSkeleton count={3} />);
    expect(screen.getAllByTestId("chat-inbox-skeleton-row")).toHaveLength(3);
  });
});
