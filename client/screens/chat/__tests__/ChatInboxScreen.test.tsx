jest.mock("@/hooks/useChats", () => ({ useChats: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { ChatInboxScreen } from "@/screens/chat/ChatInboxScreen";
import { useChats } from "@/hooks/useChats";
import { strings } from "@/i18n";
import type { ChatSummaryDTO } from "@shared/types";

const chatsMock = useChats as unknown as jest.Mock;

function state(over: Partial<ReturnType<typeof useChats>> = {}) {
  return {
    chats: [] as ChatSummaryDTO[],
    status: "ready" as const,
    errorMessage: null,
    refreshing: false,
    refresh: jest.fn(),
    retry: jest.fn(),
    ...over,
  };
}

function renderInbox() {
  const navigate = jest.fn();
  const navigation = { navigate } as unknown as never;
  const route = { params: undefined } as unknown as never;
  render(<ChatInboxScreen navigation={navigation} route={route} />);
  return navigate;
}

beforeEach(() => chatsMock.mockReset());

describe("ChatInboxScreen", () => {
  it("shows the inbox skeleton on the first load", () => {
    chatsMock.mockReturnValue(state({ status: "loading", chats: [] }));
    renderInbox();
    expect(screen.getByTestId("chat-inbox-skeleton")).toBeTruthy();
  });

  it("renders a chat row with its preview and navigates to the thread (canModerate from role)", () => {
    chatsMock.mockReturnValue(
      state({
        chats: [
          {
            community: { id: "c1", name: "Queer Creatives", imageUrl: null },
            role: "admin",
            lastMessage: {
              id: "m1",
              communityId: "c1",
              sender: { id: "u1", displayName: "Marta", avatarUrl: null },
              content: "Cześć",
              createdAt: "2026-01-01T00:00:00.000Z",
              deleted: false,
            },
          },
        ],
      }),
    );
    const navigate = renderInbox();

    expect(screen.getByText("Queer Creatives")).toBeTruthy();
    expect(screen.getByText("Marta: Cześć")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Queer Creatives"));
    expect(navigate).toHaveBeenCalledWith("ChatThread", {
      communityId: "c1",
      communityName: "Queer Creatives",
      canModerate: true,
    });
  });

  it("shows the 'no messages yet' preview when a community has no last message", () => {
    chatsMock.mockReturnValue(
      state({
        chats: [
          {
            community: { id: "c2", name: "Trans Support", imageUrl: null },
            role: "member",
            lastMessage: null,
          },
        ],
      }),
    );
    renderInbox();
    expect(screen.getByText(strings.chat.noMessagesYet)).toBeTruthy();
  });

  it("shows the empty state when the caller has no chats", () => {
    chatsMock.mockReturnValue(state({ chats: [] }));
    renderInbox();
    expect(screen.getByText(strings.chat.inboxEmpty)).toBeTruthy();
  });

  it("filters the list by the search query (client-side)", () => {
    chatsMock.mockReturnValue(
      state({
        chats: [
          {
            community: { id: "c1", name: "Queer Creatives", imageUrl: null },
            role: "member",
            lastMessage: null,
          },
          {
            community: { id: "c2", name: "Trans Support", imageUrl: null },
            role: "member",
            lastMessage: null,
          },
        ],
      }),
    );
    renderInbox();

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.chat.searchPlaceholder),
      "trans",
    );
    expect(screen.getByText("Trans Support")).toBeTruthy();
    expect(screen.queryByText("Queer Creatives")).toBeNull();
  });

  it("shows the search-empty state when nothing matches", () => {
    chatsMock.mockReturnValue(
      state({
        chats: [
          {
            community: { id: "c1", name: "Queer Creatives", imageUrl: null },
            role: "member",
            lastMessage: null,
          },
        ],
      }),
    );
    renderInbox();

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.chat.searchPlaceholder),
      "zzz",
    );
    expect(screen.getByText(strings.chat.searchEmpty)).toBeTruthy();
    expect(screen.queryByText("Queer Creatives")).toBeNull();
  });
});
