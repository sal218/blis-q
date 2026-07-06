jest.mock("@/hooks/useCommunityChat", () => ({
  useCommunityChat: jest.fn(),
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { ChatThreadScreen } from "@/screens/chat/ChatThreadScreen";
import { useCommunityChat } from "@/hooks/useCommunityChat";
import { useAuth } from "@/contexts/AuthContext";
import { strings } from "@/i18n";
import type { MessageDTO } from "@shared/types";

const chatMock = useCommunityChat as unknown as jest.Mock;
const authMock = useAuth as unknown as jest.Mock;

function msg(
  id: string,
  content: string,
  over: Partial<MessageDTO> = {},
): MessageDTO {
  return {
    id,
    communityId: "c1",
    sender: { id: `u-${id}`, displayName: `S-${id}`, avatarUrl: null },
    content,
    createdAt: new Date().toISOString(),
    deleted: false,
    ...over,
  };
}

function hookState(over: Partial<ReturnType<typeof useCommunityChat>> = {}) {
  return {
    messages: [] as MessageDTO[],
    status: "ready" as const,
    errorMessage: null,
    refreshing: false,
    loadingMore: false,
    refresh: jest.fn(),
    loadMore: jest.fn(),
    retry: jest.fn(),
    send: jest.fn().mockResolvedValue({ ok: true }),
    remove: jest.fn().mockResolvedValue({ ok: true }),
    report: jest.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
}

function renderThread() {
  const navigation = { setOptions: jest.fn() } as unknown as never;
  const route = {
    params: {
      communityId: "c1",
      communityName: "Queer Creatives",
      canModerate: false,
    },
  } as unknown as never;
  return render(<ChatThreadScreen navigation={navigation} route={route} />);
}

beforeEach(() => {
  chatMock.mockReset();
  authMock.mockReset().mockReturnValue({ user: { id: "me" } });
});

describe("ChatThreadScreen", () => {
  it("shows the thread skeleton on the first load and not once messages arrive", () => {
    chatMock.mockReturnValue(hookState({ status: "loading", messages: [] }));
    const { rerender } = renderThread();
    expect(screen.getByTestId("chat-thread-skeleton")).toBeTruthy();

    chatMock.mockReturnValue(hookState({ messages: [msg("m1", "Cześć")] }));
    const navigation = { setOptions: jest.fn() } as unknown as never;
    const route = {
      params: {
        communityId: "c1",
        communityName: "Queer Creatives",
        canModerate: false,
      },
    } as unknown as never;
    rerender(<ChatThreadScreen navigation={navigation} route={route} />);
    expect(screen.queryByTestId("chat-thread-skeleton")).toBeNull();
    expect(screen.getByText("Cześć")).toBeTruthy();
  });

  it("renders message content and masks deleted messages", () => {
    chatMock.mockReturnValue(
      hookState({
        messages: [
          msg("m1", "Cześć wszystkim"),
          msg("m2", "[deleted]", { deleted: true, sender: null }),
        ],
      }),
    );
    renderThread();

    expect(screen.getByText("Cześć wszystkim")).toBeTruthy();
    expect(screen.getByText(strings.chat.deleted)).toBeTruthy();
  });

  it("typing and pressing Send calls the hook with the trimmed text", async () => {
    const send = jest.fn().mockResolvedValue({ ok: true });
    chatMock.mockReturnValue(hookState({ send }));
    renderThread();

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.chat.composerPlaceholder),
      "  Nowa wiadomość  ",
    );
    fireEvent.press(screen.getByLabelText(strings.chat.send));

    await waitFor(() => expect(send).toHaveBeenCalledWith("Nowa wiadomość"));
  });

  it("shows the error state with a retry when loading failed", () => {
    const retry = jest.fn();
    chatMock.mockReturnValue(
      hookState({
        status: "error",
        errorMessage: strings.chat.loadError,
        retry,
      }),
    );
    renderThread();

    expect(screen.getByText(strings.chat.loadError)).toBeTruthy();
    fireEvent.press(screen.getByText(strings.chat.retry));
    expect(retry).toHaveBeenCalled();
  });
});
