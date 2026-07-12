jest.mock("@/lib/api/news", () => ({ listNews: jest.fn() }));

// Run the focus callback on mount (mirrors returning to the screen).
jest.mock("@react-navigation/native", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    useFocusEffect: (cb: () => void) => {
      React.useEffect(cb, [cb]);
    },
  };
});

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useNews } from "@/hooks/useNews";
import { listNews } from "@/lib/api/news";
import type { NewsDTO } from "@shared/types";

const listMock = listNews as unknown as jest.Mock;

const article = (over: Partial<NewsDTO> & { id: string }): NewsDTO => ({
  title: over.id,
  summary: "",
  body: "Treść",
  category: "world",
  source: "Blis-Q Redakcja",
  sourceUrl: null,
  imageUrl: null,
  featured: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

const pageOf = (items: NewsDTO[], page: number, totalPages: number) => ({
  ok: true as const,
  data: { data: items, page, pageSize: 25, total: totalPages * 25, totalPages },
});

beforeEach(() => {
  listMock.mockReset();
});

describe("useNews", () => {
  it("loads on focus → ready with the items", async () => {
    listMock.mockResolvedValue(pageOf([article({ id: "n1" })], 1, 1));
    const { result } = renderHook(() => useNews());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items.map((a) => a.id)).toEqual(["n1"]);
    expect(listMock).toHaveBeenLastCalledWith({
      page: 1,
      category: undefined,
      search: undefined,
    });
  });

  it("setCategory refetches page 1 with the new category", async () => {
    listMock.mockResolvedValue(pageOf([article({ id: "n1" })], 1, 1));
    const { result } = renderHook(() => useNews());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      result.current.setCategory("rights");
    });
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith({
        page: 1,
        category: "rights",
        search: undefined,
      }),
    );
    expect(result.current.category).toBe("rights");
  });

  it("loadMore appends the next page and stops at the last page", async () => {
    listMock.mockResolvedValueOnce(pageOf([article({ id: "n1" })], 1, 2));
    const { result } = renderHook(() => useNews());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(pageOf([article({ id: "n2" })], 2, 2));
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() =>
      expect(result.current.items.map((a) => a.id)).toEqual(["n1", "n2"]),
    );

    // Now on the last page → loadMore is a no-op (no further fetch).
    const calls = listMock.mock.calls.length;
    await act(async () => {
      result.current.loadMore();
    });
    expect(listMock.mock.calls.length).toBe(calls);
  });

  it("setSearch refetches page 1 with the (server-side) search term", async () => {
    listMock.mockResolvedValue(pageOf([article({ id: "n1" })], 1, 1));
    const { result } = renderHook(() => useNews());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValue(pageOf([article({ id: "n2" })], 1, 1));
    await act(async () => {
      result.current.setSearch("marsz");
    });
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith({
        page: 1,
        category: undefined,
        search: "marsz",
      }),
    );
    expect(result.current.search).toBe("marsz");
    expect(result.current.items.map((a) => a.id)).toEqual(["n2"]);
  });

  it("a failed load → error, and retry refetches", async () => {
    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useNews());
    await waitFor(() => expect(result.current.status).toBe("error"));

    listMock.mockResolvedValueOnce(pageOf([article({ id: "n1" })], 1, 1));
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items.map((a) => a.id)).toEqual(["n1"]);
  });
});
