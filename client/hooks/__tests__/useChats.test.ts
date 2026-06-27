jest.mock("@/lib/api/chat", () => ({ listChats: jest.fn() }));

// Capture the focus callback so a test can simulate returning to the inbox.
let mockFocusCb: (() => void) | undefined;
jest.mock("@react-navigation/native", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    useFocusEffect: (cb: () => void) => {
      mockFocusCb = cb;
      React.useEffect(cb, [cb]);
    },
  };
});

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useChats } from "@/hooks/useChats";
import { listChats } from "@/lib/api/chat";
import type { ChatSummaryDTO } from "@shared/types";

const listMock = listChats as unknown as jest.Mock;

const item = (id: string): ChatSummaryDTO => ({
  community: { id, name: id, imageUrl: null },
  role: "member",
  lastMessage: null,
});

beforeEach(() => {
  listMock.mockReset();
  mockFocusCb = undefined;
});

describe("useChats", () => {
  it("loads on focus → ready with the chats", async () => {
    listMock.mockResolvedValue({ ok: true, data: [item("c1")] });
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.chats).toEqual([item("c1")]);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error state on initial failure", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorMessage).toEqual(expect.any(String));
  });

  // Regression: returning to the inbox must refetch WITHOUT the pull-to-refresh
  // spinner (no `refreshing`, never back to `loading`) — silent background update.
  it("re-focus refetches silently (no spinner) and updates in the background", async () => {
    listMock.mockResolvedValue({ ok: true, data: [item("c1")] });
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValue({ ok: true, data: [item("c2")] });
    await act(async () => {
      mockFocusCb?.(); // simulate navigating back to the inbox
    });

    await waitFor(() => expect(result.current.chats).toEqual([item("c2")]));
    expect(result.current.refreshing).toBe(false);
    expect(result.current.status).toBe("ready"); // never flipped to "loading"
  });
});
