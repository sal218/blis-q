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
  // spinner. Asserted WHILE the refetch is in flight (a deferred promise) so a
  // regression to "refresh"/"initial" mode — which would set refreshing/loading
  // before resolving — is actually caught.
  it("re-focus refetches silently — no spinner in flight, updates on resolve", async () => {
    listMock.mockResolvedValue({ ok: true, data: [item("c1")] });
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let resolveRefetch!: (v: unknown) => void;
    listMock.mockReturnValueOnce(
      new Promise((r) => {
        resolveRefetch = r;
      }),
    );
    act(() => {
      mockFocusCb?.(); // navigate back to the inbox; refetch now in flight
    });

    // In flight: no spinner, not loading, the existing list still shown.
    expect(result.current.refreshing).toBe(false);
    expect(result.current.status).toBe("ready");
    expect(result.current.chats).toEqual([item("c1")]);

    await act(async () => {
      resolveRefetch({ ok: true, data: [item("c2")] });
    });
    await waitFor(() => expect(result.current.chats).toEqual([item("c2")]));
    expect(result.current.refreshing).toBe(false);
  });

  it("a silent re-focus failure keeps the existing list (no error screen)", async () => {
    listMock.mockResolvedValue({ ok: true, data: [item("c1")] });
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    await act(async () => {
      mockFocusCb?.();
    });

    expect(result.current.status).toBe("ready"); // not flipped to "error"
    expect(result.current.chats).toEqual([item("c1")]); // list preserved
    expect(result.current.errorMessage).toBeNull();
  });
});
