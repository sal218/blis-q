jest.mock("@/lib/api/news", () => ({ getArticle: jest.fn() }));

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
import { useArticle } from "@/hooks/useArticle";
import { getArticle } from "@/lib/api/news";
import type { NewsDTO } from "@shared/types";

const getMock = getArticle as unknown as jest.Mock;

const ARTICLE: NewsDTO = {
  id: "n1",
  title: "Parlament Europejski",
  summary: "Rezolucja.",
  body: "Pełna treść.",
  category: "world",
  source: "Blis-Q Redakcja",
  sourceUrl: null,
  imageUrl: null,
  featured: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};

beforeEach(() => {
  getMock.mockReset();
});

describe("useArticle", () => {
  it("loads the article by id on focus → ready", async () => {
    getMock.mockResolvedValue({ ok: true, data: ARTICLE });
    const { result } = renderHook(() => useArticle("n1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.article).toEqual(ARTICLE);
    expect(getMock).toHaveBeenCalledWith("n1");
  });

  it("a failed load → error, and retry refetches → ready", async () => {
    getMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useArticle("n1"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    getMock.mockResolvedValueOnce({ ok: true, data: ARTICLE });
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.article).toEqual(ARTICLE);
  });
});
