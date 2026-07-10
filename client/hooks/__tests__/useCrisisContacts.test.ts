jest.mock("@/lib/api/crisisContacts", () => ({
  listCrisisContacts: jest.fn(),
}));
// useFocusEffect runs its callback once on mount (React.useEffect), so the hook
// loads without a NavigationContainer.
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require("react");
    React.useEffect(() => cb(), []);
  },
}));

import { renderHook, waitFor } from "@testing-library/react-native";
import { listCrisisContacts } from "@/lib/api/crisisContacts";
import { useCrisisContacts } from "@/hooks/useCrisisContacts";
import type { CrisisContactDTO } from "@shared/types";

const listMock = listCrisisContacts as unknown as jest.Mock;

function contact(over: Partial<CrisisContactDTO> = {}): CrisisContactDTO {
  return {
    id: "c1",
    name: "Telefon zaufania",
    phone: "116 123",
    description: "Wsparcie w kryzysie.",
    hours: null,
    category: "emotional_crisis",
    verified: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}
function pageOf(items: CrisisContactDTO[], totalPages = 1) {
  return {
    ok: true as const,
    data: {
      data: items,
      page: 1,
      pageSize: 100,
      total: items.length,
      totalPages,
    },
  };
}

beforeEach(() => listMock.mockReset());

describe("useCrisisContacts", () => {
  it("loads on focus → ready with the items", async () => {
    listMock.mockResolvedValue(pageOf([contact()]));
    const { result } = renderHook(() => useCrisisContacts());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toHaveLength(1);
    // Fetches the whole list in one page (pageSize = server max).
    expect(listMock).toHaveBeenCalledWith({ pageSize: 100 });
  });

  it("maps a failed load → error", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "server" } });
    const { result } = renderHook(() => useCrisisContacts());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.items).toHaveLength(0);
  });
});
