jest.mock("@/lib/api/resources", () => ({ listResources: jest.fn() }));

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
import { useResources } from "@/hooks/useResources";
import { listResources } from "@/lib/api/resources";
import type { ResourceDTO } from "@shared/types";

const listMock = listResources as unknown as jest.Mock;

const resource = (
  over: Partial<ResourceDTO> & { id: string },
): ResourceDTO => ({
  title: over.id,
  category: "mental_health",
  body: "",
  url: null,
  featured: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

const pageOf = (items: ResourceDTO[], page: number, totalPages: number) => ({
  ok: true as const,
  data: { data: items, page, pageSize: 25, total: totalPages * 25, totalPages },
});

beforeEach(() => {
  listMock.mockReset();
});

describe("useResources", () => {
  it("loads on focus → ready with the items", async () => {
    listMock.mockResolvedValue(pageOf([resource({ id: "r1" })], 1, 1));
    const { result } = renderHook(() => useResources());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items.map((r) => r.id)).toEqual(["r1"]);
    expect(listMock).toHaveBeenLastCalledWith({ page: 1, category: undefined });
  });

  it("setCategory refetches page 1 with the new category", async () => {
    listMock.mockResolvedValue(pageOf([resource({ id: "r1" })], 1, 1));
    const { result } = renderHook(() => useResources());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      result.current.setCategory("legal_rights");
    });
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith({
        page: 1,
        category: "legal_rights",
      }),
    );
    expect(result.current.category).toBe("legal_rights");
  });

  it("loadMore appends the next page and stops at the last page", async () => {
    listMock.mockResolvedValueOnce(pageOf([resource({ id: "r1" })], 1, 2));
    const { result } = renderHook(() => useResources());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    listMock.mockResolvedValueOnce(pageOf([resource({ id: "r2" })], 2, 2));
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() =>
      expect(result.current.items.map((r) => r.id)).toEqual(["r1", "r2"]),
    );

    // Now on the last page → loadMore is a no-op (no further fetch).
    const calls = listMock.mock.calls.length;
    await act(async () => {
      result.current.loadMore();
    });
    expect(listMock.mock.calls.length).toBe(calls);
  });

  it("search filters the loaded items client-side WITHOUT refetching", async () => {
    listMock.mockResolvedValue(
      pageOf(
        [
          resource({ id: "r1", title: "Telefon zaufania", body: "kryzys" }),
          resource({ id: "r2", title: "Poradnik prawny", body: "prawa" }),
        ],
        1,
        1,
      ),
    );
    const { result } = renderHook(() => useResources());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const calls = listMock.mock.calls.length;

    act(() => {
      result.current.setSearch("prawn");
    });
    expect(result.current.items.map((r) => r.id)).toEqual(["r2"]);
    // No server round-trip — the list endpoint has no ?search=.
    expect(listMock.mock.calls.length).toBe(calls);

    act(() => {
      result.current.setSearch("");
    });
    expect(result.current.items.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("a failed load → error, and retry refetches", async () => {
    listMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useResources());
    await waitFor(() => expect(result.current.status).toBe("error"));

    listMock.mockResolvedValueOnce(pageOf([resource({ id: "r1" })], 1, 1));
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items.map((r) => r.id)).toEqual(["r1"]);
  });
});
