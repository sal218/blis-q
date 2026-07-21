jest.mock("@/lib/api/news", () => ({ getRelatedNews: jest.fn() }));

import { renderHook, waitFor } from "@testing-library/react-native";
import { useRelatedNews } from "@/hooks/useRelatedNews";
import { getRelatedNews } from "@/lib/api/news";
import type { NewsDTO } from "@shared/types";

const relMock = getRelatedNews as unknown as jest.Mock;

const ITEMS: NewsDTO[] = [
  {
    id: "n2",
    title: "Powiązana",
    summary: "…",
    body: null,
    category: "world",
    source: "Blis-Q",
    sourceUrl: null,
    imageUrl: null,
    featured: false,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
];

beforeEach(() => relMock.mockReset());

describe("useRelatedNews", () => {
  it("loads related items → ready", async () => {
    relMock.mockResolvedValue({ ok: true, data: ITEMS });
    const { result } = renderHook(() => useRelatedNews("n1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toEqual(ITEMS);
    expect(relMock).toHaveBeenCalledWith("n1");
  });

  it("on failure → error status + empty items (section hides, no retry)", async () => {
    relMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useRelatedNews("n1"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.items).toEqual([]);
  });
});
