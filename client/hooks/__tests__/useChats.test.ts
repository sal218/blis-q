jest.mock("@/lib/api/chat", () => ({ listChats: jest.fn() }));

// useFocusEffect → run the effect on mount (the inbox loads/refreshes on focus).
jest.mock("@react-navigation/native", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});

import { renderHook, waitFor } from "@testing-library/react-native";
import { useChats } from "@/hooks/useChats";
import { listChats } from "@/lib/api/chat";
import type { ChatSummaryDTO } from "@shared/types";

const listMock = listChats as unknown as jest.Mock;

const item: ChatSummaryDTO = {
  community: { id: "c1", name: "Queer Creatives", imageUrl: null },
  role: "member",
  lastMessage: null,
};

beforeEach(() => listMock.mockReset());

describe("useChats", () => {
  it("loads on focus → ready with the chats", async () => {
    listMock.mockResolvedValue({ ok: true, data: [item] });
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.chats).toEqual([item]);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error state on failure", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorMessage).toEqual(expect.any(String));
  });
});
