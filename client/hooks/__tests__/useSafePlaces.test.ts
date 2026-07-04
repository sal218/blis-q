jest.mock("@/lib/api/safePlaces", () => ({ listSafePlaces: jest.fn() }));

// Capture the focus callback so a test can simulate returning to the screen.
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
import { useSafePlaces } from "@/hooks/useSafePlaces";
import { listSafePlaces } from "@/lib/api/safePlaces";
import type { SafePlaceDTO } from "@shared/types";

const listMock = listSafePlaces as unknown as jest.Mock;

const place = (id: string): SafePlaceDTO => ({
  id,
  name: id,
  category: "cafe",
  description: null,
  address: null,
  city: "Warszawa",
  latitude: null,
  longitude: null,
});

const pageOf = (ids: string[], page: number, totalPages: number) => ({
  ok: true as const,
  data: {
    data: ids.map(place),
    page,
    pageSize: 25,
    total: totalPages * 25,
    totalPages,
  },
});

beforeEach(() => {
  listMock.mockReset();
  mockFocusCb = undefined;
});

describe("useSafePlaces", () => {
  it("loads on focus → ready with the items", async () => {
    listMock.mockResolvedValue(pageOf(["s1"], 1, 1));
    const { result } = renderHook(() => useSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toEqual([place("s1")]);
    expect(listMock).toHaveBeenCalledWith({
      page: 1,
      category: undefined,
      search: undefined,
    });
  });

  it("surfaces an error state on initial failure", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorMessage).toEqual(expect.any(String));
  });

  it("setCategory refetches from page 1 with the category and replaces", async () => {
    listMock.mockResolvedValueOnce(pageOf(["s1"], 1, 1));
    const { result } = renderHook(() => useSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(pageOf(["c1"], 1, 1));
    await act(async () => {
      result.current.setCategory("club");
    });
    await waitFor(() => expect(result.current.items).toEqual([place("c1")]));
    expect(result.current.category).toBe("club");
    expect(listMock).toHaveBeenLastCalledWith({
      page: 1,
      category: "club",
      search: undefined,
    });
  });

  it("setSearch applies a search term (trimmed, reloads page 1)", async () => {
    listMock.mockResolvedValueOnce(pageOf(["s1"], 1, 1));
    const { result } = renderHook(() => useSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(pageOf(["k1"], 1, 1));
    await act(async () => {
      result.current.setSearch("  Kraków  ");
    });
    await waitFor(() => expect(result.current.search).toBe("Kraków")); // trimmed
    expect(listMock).toHaveBeenLastCalledWith({
      page: 1,
      category: undefined,
      search: "Kraków",
    });
  });

  it("setSearch back to blank clears the filter → full list", async () => {
    listMock.mockResolvedValueOnce(pageOf(["s1"], 1, 1));
    const { result } = renderHook(() => useSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(pageOf(["k1"], 1, 1));
    await act(async () => {
      result.current.setSearch("Kraków");
    });
    await waitFor(() => expect(result.current.search).toBe("Kraków"));

    listMock.mockResolvedValueOnce(pageOf(["s1"], 1, 1));
    await act(async () => {
      result.current.setSearch("   "); // blank → clear
    });
    await waitFor(() => expect(result.current.search).toBe(""));
    expect(listMock).toHaveBeenLastCalledWith({
      page: 1,
      category: undefined,
      search: undefined, // no filter sent
    });
  });

  it("load-more appends the next page and advances", async () => {
    listMock.mockResolvedValueOnce(pageOf(["s1"], 1, 2));
    const { result } = renderHook(() => useSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(pageOf(["s2"], 2, 2));
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() =>
      expect(result.current.items).toEqual([place("s1"), place("s2")]),
    );
    expect(listMock).toHaveBeenLastCalledWith({
      page: 2,
      category: undefined,
      search: undefined,
    });
  });

  it("load-more is a no-op on the last page", async () => {
    listMock.mockResolvedValue(pageOf(["s1"], 1, 1));
    const { result } = renderHook(() => useSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      result.current.loadMore();
    });
    expect(listMock).toHaveBeenCalledTimes(1); // no extra fetch
  });

  it("drops a stale load-more that resolves after a refresh (stale-guard)", async () => {
    listMock.mockResolvedValueOnce(pageOf(["s1"], 1, 2)); // initial
    const { result } = renderHook(() => useSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let resolveMore!: (v: unknown) => void;
    listMock.mockReturnValueOnce(
      new Promise((r) => {
        resolveMore = r;
      }),
    ); // load-more in flight
    act(() => {
      result.current.loadMore();
    });

    listMock.mockResolvedValueOnce(pageOf(["s9"], 1, 1)); // refresh wins
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.items).toEqual([place("s9")]));

    await act(async () => {
      resolveMore(pageOf(["s2"], 2, 2)); // stale → must NOT append
    });
    expect(result.current.items).toEqual([place("s9")]);
  });

  it("re-focus refetches silently (no spinner in flight)", async () => {
    listMock.mockResolvedValue(pageOf(["s1"], 1, 1));
    const { result } = renderHook(() => useSafePlaces());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(pageOf(["s2"], 1, 1));
    await act(async () => {
      mockFocusCb?.();
    });
    expect(result.current.refreshing).toBe(false);
    await waitFor(() => expect(result.current.items).toEqual([place("s2")]));
  });
});
