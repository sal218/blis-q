jest.mock("@/hooks/useResources", () => ({ useResources: jest.fn() }));

import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { Linking } from "react-native";
import { ResourcesListScreen } from "@/screens/resources/ResourcesListScreen";
import { useResources } from "@/hooks/useResources";
import { strings } from "@/i18n";
import type { ResourceDTO } from "@shared/types";

const rMock = useResources as unknown as jest.Mock;

const resource = (id: string, title: string): ResourceDTO => ({
  id,
  title,
  category: "mental_health",
  body: "…",
  url: "https://example.org",
  featured: false,
  createdAt: "2026-07-01T00:00:00.000Z",
});

function state(over: Partial<ReturnType<typeof useResources>> = {}) {
  return {
    items: [] as ResourceDTO[],
    status: "ready" as const,
    errorMessage: null,
    refreshing: false,
    loadingMore: false,
    category: null,
    search: "",
    setCategory: jest.fn(),
    setSearch: jest.fn(),
    refresh: jest.fn(),
    loadMore: jest.fn(),
    retry: jest.fn(),
    ...over,
  };
}

function renderScreen(nav: { navigate: jest.Mock }, category?: string) {
  const route = { params: category ? { category } : {} } as never;
  return render(
    <ResourcesListScreen navigation={nav as never} route={route} />,
  );
}

beforeEach(() => rMock.mockReset());

describe("ResourcesListScreen", () => {
  it("shows the skeleton on first load, then the cards", () => {
    rMock.mockReturnValue(state({ status: "loading", items: [] }));
    const nav = { navigate: jest.fn() };
    const { rerender } = renderScreen(nav);
    expect(screen.getByTestId("card-list-skeleton")).toBeTruthy();

    rMock.mockReturnValue(state({ items: [resource("r1", "Materiał Alpha")] }));
    rerender(
      <ResourcesListScreen
        navigation={nav as never}
        route={{ params: {} } as never}
      />,
    );
    expect(screen.queryByTestId("card-list-skeleton")).toBeNull();
    expect(screen.getByText("Materiał Alpha")).toBeTruthy();
  });

  it("renders the filter chip row: 'Wszystkie' + category labels", () => {
    rMock.mockReturnValue(state({ items: [] }));
    renderScreen({ navigate: jest.fn() });
    expect(screen.getByText(strings.resources.filterAll)).toBeTruthy();
    expect(
      screen.getByText(strings.resources.categories.mental_health),
    ).toBeTruthy();
    expect(
      screen.getByText(strings.resources.categories.housing_support),
    ).toBeTruthy();
  });

  it("tapping a category chip calls setCategory; 'Wszystkie' clears it", () => {
    const setCategory = jest.fn();
    rMock.mockReturnValue(state({ category: "legal_rights", setCategory }));
    renderScreen({ navigate: jest.fn() });
    fireEvent.press(
      screen.getByText(strings.resources.categories.mental_health),
    );
    expect(setCategory).toHaveBeenCalledWith("mental_health");
    fireEvent.press(screen.getByText(strings.resources.filterAll));
    expect(setCategory).toHaveBeenCalledWith(null);
  });

  it("filters as you type (debounced)", () => {
    jest.useFakeTimers();
    const setSearch = jest.fn();
    rMock.mockReturnValue(state({ setSearch }));
    renderScreen({ navigate: jest.fn() });
    const input = screen.getByPlaceholderText(
      strings.resources.searchPlaceholder,
    );
    fireEvent.changeText(input, "zaufan");
    expect(setSearch).not.toHaveBeenCalledWith("zaufan");
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(setSearch).toHaveBeenCalledWith("zaufan");
    jest.useRealTimers();
  });

  it("tapping a card navigates to the detail — and never opens the link directly (P3)", () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as unknown as void);
    rMock.mockReturnValue(state({ items: [resource("r1", "Materiał Alpha")] }));
    const nav = { navigate: jest.fn() };
    renderScreen(nav);

    fireEvent.press(screen.getByText("Materiał Alpha"));
    expect(nav.navigate).toHaveBeenCalledWith("ResourceDetail", { id: "r1" });
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it("empty-copy precedence: plain / category / search", () => {
    rMock.mockReturnValue(state({ items: [] }));
    const nav = { navigate: jest.fn() };
    const { rerender } = renderScreen(nav);
    expect(screen.getByText(strings.resources.empty)).toBeTruthy();

    rMock.mockReturnValue(state({ items: [], category: "legal_rights" }));
    rerender(
      <ResourcesListScreen
        navigation={nav as never}
        route={{ params: {} } as never}
      />,
    );
    expect(screen.getByText(strings.resources.emptyCategory)).toBeTruthy();

    rMock.mockReturnValue(state({ items: [], search: "zzz" }));
    rerender(
      <ResourcesListScreen
        navigation={nav as never}
        route={{ params: {} } as never}
      />,
    );
    expect(screen.getByText(strings.resources.emptySearch)).toBeTruthy();
  });

  it("shows the error state with a retry", () => {
    const retry = jest.fn();
    rMock.mockReturnValue(
      state({ items: [], status: "error", errorMessage: "Błąd", retry }),
    );
    renderScreen({ navigate: jest.fn() });
    fireEvent.press(screen.getByText(strings.resources.retry));
    expect(retry).toHaveBeenCalled();
  });
});
