jest.mock("@/hooks/useNews", () => ({ useNews: jest.fn() }));

import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { Linking } from "react-native";
import { NewsFeedScreen } from "@/screens/news/NewsFeedScreen";
import { useNews } from "@/hooks/useNews";
import { strings } from "@/i18n";
import type { NewsDTO } from "@shared/types";

const nMock = useNews as unknown as jest.Mock;

const article = (over: Partial<NewsDTO> & { id: string }): NewsDTO => ({
  title: over.id,
  summary: "…",
  body: "Treść",
  category: "world",
  source: "Blis-Q Redakcja",
  sourceUrl: null,
  imageUrl: null,
  featured: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

function state(over: Partial<ReturnType<typeof useNews>> = {}) {
  return {
    items: [] as NewsDTO[],
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
  render(<NewsFeedScreen navigation={nav as never} route={{} as never} />);

beforeEach(() => nMock.mockReset());

describe("NewsFeedScreen", () => {
  it("renders the header, subtitle, inline search and category chips", () => {
    nMock.mockReturnValue(state());
    renderScreen({ navigate: jest.fn() });
    expect(screen.getByText(strings.news.title)).toBeTruthy();
    expect(screen.getByText(strings.news.subtitle)).toBeTruthy();
    expect(
      screen.getByPlaceholderText(strings.news.searchPlaceholder),
    ).toBeTruthy();
    expect(screen.getByText(strings.news.filterAll)).toBeTruthy();
    expect(screen.getByText(strings.news.categories.rights)).toBeTruthy();
  });

  it("shows the skeleton on the first load, then the cards", () => {
    nMock.mockReturnValue(state({ status: "loading", items: [] }));
    const nav = { navigate: jest.fn() };
    const { rerender } = renderScreen(nav);
    expect(screen.getByTestId("card-list-skeleton")).toBeTruthy();

    nMock.mockReturnValue(
      state({ items: [article({ id: "Wiadomość Alpha" })] }),
    );
    rerender(<NewsFeedScreen navigation={nav as never} route={{} as never} />);
    expect(screen.queryByTestId("card-list-skeleton")).toBeNull();
    expect(screen.getByText("Wiadomość Alpha")).toBeTruthy();
  });

  it("in the default view, shows a 'Na topie' featured section + the rest", () => {
    nMock.mockReturnValue(
      state({
        items: [
          article({ id: "Rezolucja", featured: true }),
          article({ id: "Zwykła wiadomość", featured: false }),
        ],
      }),
    );
    renderScreen({ navigate: jest.fn() });
    expect(screen.getByText(strings.news.featuredTitle)).toBeTruthy();
    expect(screen.getByText(strings.news.allTitle)).toBeTruthy();
    expect(screen.getByText("Rezolucja")).toBeTruthy();
    expect(screen.getByText("Zwykła wiadomość")).toBeTruthy();
  });

  it("hides the featured section when a category is active", () => {
    nMock.mockReturnValue(
      state({
        category: "world",
        items: [article({ id: "X", featured: true })],
      }),
    );
    renderScreen({ navigate: jest.fn() });
    expect(screen.queryByText(strings.news.featuredTitle)).toBeNull();
  });

  it("tapping a category chip calls setCategory; 'Wszystkie' clears it", () => {
    const setCategory = jest.fn();
    nMock.mockReturnValue(state({ category: "rights", setCategory }));
    renderScreen({ navigate: jest.fn() });
    fireEvent.press(screen.getByText(strings.news.categories.health));
    expect(setCategory).toHaveBeenCalledWith("health");
    fireEvent.press(screen.getByText(strings.news.filterAll));
    expect(setCategory).toHaveBeenCalledWith(null);
  });

  it("typing in the search box calls setSearch (debounced)", () => {
    jest.useFakeTimers();
    const setSearch = jest.fn();
    nMock.mockReturnValue(state({ setSearch }));
    renderScreen({ navigate: jest.fn() });
    const input = screen.getByPlaceholderText(strings.news.searchPlaceholder);
    fireEvent.changeText(input, "marsz");
    expect(setSearch).not.toHaveBeenCalledWith("marsz");
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(setSearch).toHaveBeenCalledWith("marsz");
    jest.useRealTimers();
  });

  it("tapping a card opens the article — and never opens a link directly", () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as unknown as void);
    nMock.mockReturnValue(
      state({
        items: [
          article({
            id: "n1",
            title: "Zewnętrzna",
            body: null,
            sourceUrl: "https://oko.press",
          }),
        ],
      }),
    );
    const nav = { navigate: jest.fn() };
    renderScreen(nav);
    fireEvent.press(screen.getByText("Zewnętrzna"));
    expect(nav.navigate).toHaveBeenCalledWith("NewsArticle", { id: "n1" });
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it("empty-copy precedence: plain / category / search", () => {
    nMock.mockReturnValue(state({ items: [] }));
    const nav = { navigate: jest.fn() };
    const { rerender } = renderScreen(nav);
    expect(screen.getByText(strings.news.empty)).toBeTruthy();

    nMock.mockReturnValue(state({ items: [], category: "rights" }));
    rerender(<NewsFeedScreen navigation={nav as never} route={{} as never} />);
    expect(screen.getByText(strings.news.emptyCategory)).toBeTruthy();

    nMock.mockReturnValue(state({ items: [], search: "zzz" }));
    rerender(<NewsFeedScreen navigation={nav as never} route={{} as never} />);
    expect(screen.getByText(strings.news.emptySearch)).toBeTruthy();
  });

  it("the crisis-help button opens the Crisis screen (same stack)", () => {
    nMock.mockReturnValue(state());
    const nav = { navigate: jest.fn() };
    renderScreen(nav);
    fireEvent.press(screen.getByRole("button", { name: strings.crisis.open }));
    expect(nav.navigate).toHaveBeenCalledWith("Crisis");
  });

  it("shows the error state with a retry", () => {
    const retry = jest.fn();
    nMock.mockReturnValue(
      state({ items: [], status: "error", errorMessage: "Błąd", retry }),
    );
    renderScreen({ navigate: jest.fn() });
    fireEvent.press(screen.getByText(strings.news.retry));
    expect(retry).toHaveBeenCalled();
  });
});
