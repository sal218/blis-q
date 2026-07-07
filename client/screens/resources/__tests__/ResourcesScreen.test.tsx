jest.mock("@/hooks/useResources", () => ({ useResources: jest.fn() }));

import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { Linking } from "react-native";
import { ResourcesScreen } from "@/screens/resources/ResourcesScreen";
import { useResources } from "@/hooks/useResources";
import { strings } from "@/i18n";
import type { ResourceDTO } from "@shared/types";

const rMock = useResources as unknown as jest.Mock;

const resource = (
  over: Partial<ResourceDTO> & { id: string },
): ResourceDTO => ({
  title: over.id,
  category: "mental_health",
  body: "…",
  url: null,
  featured: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
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

const renderScreen = (nav: { navigate: jest.Mock }) =>
  render(<ResourcesScreen navigation={nav as never} route={{} as never} />);

beforeEach(() => rMock.mockReset());

describe("ResourcesScreen (directory)", () => {
  it("renders the header, subtitle, inline search and category chips", () => {
    rMock.mockReturnValue(state());
    renderScreen({ navigate: jest.fn() });
    expect(screen.getByText(strings.resources.title)).toBeTruthy();
    expect(screen.getByText(strings.resources.subtitle)).toBeTruthy();
    // The search is a real inline input (not a button that navigates away).
    expect(
      screen.getByPlaceholderText(strings.resources.searchPlaceholder),
    ).toBeTruthy();
    expect(screen.getByText(strings.resources.filterAll)).toBeTruthy();
    expect(
      screen.getByText(strings.resources.categories.mental_health),
    ).toBeTruthy();
  });

  it("shows the skeleton on the first load, then the cards", () => {
    rMock.mockReturnValue(state({ status: "loading", items: [] }));
    const nav = { navigate: jest.fn() };
    const { rerender } = renderScreen(nav);
    expect(screen.getByTestId("card-list-skeleton")).toBeTruthy();

    rMock.mockReturnValue(
      state({ items: [resource({ id: "Materiał Alpha" })] }),
    );
    rerender(<ResourcesScreen navigation={nav as never} route={{} as never} />);
    expect(screen.queryByTestId("card-list-skeleton")).toBeNull();
    expect(screen.getByText("Materiał Alpha")).toBeTruthy();
  });

  it("in the default view, shows a 'Polecane' featured section + the rest list", () => {
    rMock.mockReturnValue(
      state({
        items: [
          resource({ id: "Trevor", featured: true }),
          resource({ id: "Zwykły wpis", featured: false }),
        ],
      }),
    );
    renderScreen({ navigate: jest.fn() });
    expect(screen.getByText(strings.resources.featuredTitle)).toBeTruthy();
    expect(screen.getByText(strings.resources.allTitle)).toBeTruthy();
    expect(screen.getByText("Trevor")).toBeTruthy();
    expect(screen.getByText("Zwykły wpis")).toBeTruthy();
  });

  it("hides the featured section when a category is active", () => {
    rMock.mockReturnValue(
      state({
        category: "mental_health",
        items: [resource({ id: "X", featured: true })],
      }),
    );
    renderScreen({ navigate: jest.fn() });
    expect(screen.queryByText(strings.resources.featuredTitle)).toBeNull();
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

  it("typing in the search box calls setSearch (debounced)", () => {
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

  it("tapping a card opens the detail — and never opens a link directly (P3)", () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as unknown as void);
    rMock.mockReturnValue(
      state({
        items: [
          resource({
            id: "r1",
            title: "Linkowany",
            url: "https://example.org",
          }),
        ],
      }),
    );
    const nav = { navigate: jest.fn() };
    renderScreen(nav);
    fireEvent.press(screen.getByText("Linkowany"));
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
    rerender(<ResourcesScreen navigation={nav as never} route={{} as never} />);
    expect(screen.getByText(strings.resources.emptyCategory)).toBeTruthy();

    rMock.mockReturnValue(state({ items: [], search: "zzz" }));
    rerender(<ResourcesScreen navigation={nav as never} route={{} as never} />);
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
