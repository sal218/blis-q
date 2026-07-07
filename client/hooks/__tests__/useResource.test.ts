jest.mock("@/lib/api/resources", () => ({ getResource: jest.fn() }));

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
import { useResource } from "@/hooks/useResource";
import { getResource } from "@/lib/api/resources";
import type { ResourceDTO } from "@shared/types";

const getMock = getResource as unknown as jest.Mock;

const RESOURCE: ResourceDTO = {
  id: "r1",
  title: "Telefon zaufania",
  category: "mental_health",
  body: "Wsparcie w kryzysie.",
  url: "https://example.org",
  featured: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};

beforeEach(() => {
  getMock.mockReset();
});

describe("useResource", () => {
  it("loads the resource by id on focus → ready", async () => {
    getMock.mockResolvedValue({ ok: true, data: RESOURCE });
    const { result } = renderHook(() => useResource("r1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.resource).toEqual(RESOURCE);
    expect(getMock).toHaveBeenCalledWith("r1");
  });

  it("a failed load → error, and retry refetches → ready", async () => {
    getMock.mockResolvedValueOnce({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useResource("r1"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    getMock.mockResolvedValueOnce({ ok: true, data: RESOURCE });
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.resource).toEqual(RESOURCE);
  });
});
