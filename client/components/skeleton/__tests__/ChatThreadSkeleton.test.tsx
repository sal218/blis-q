import { render, screen } from "@testing-library/react-native";
import { ChatThreadSkeleton } from "@/components/skeleton/ChatThreadSkeleton";

describe("ChatThreadSkeleton", () => {
  it("renders a column of alternating message-bubble placeholders", () => {
    render(<ChatThreadSkeleton />);
    expect(screen.getByTestId("chat-thread-skeleton")).toBeTruthy();
    // A conversation-shaped set of bubbles (both incoming + outgoing sides).
    expect(
      screen.getAllByTestId("chat-thread-skeleton-bubble").length,
    ).toBeGreaterThanOrEqual(6);
  });
});
