jest.mock("@/hooks/useArticle", () => ({ useArticle: jest.fn() }));
jest.mock("@/hooks/useRelatedNews", () => ({ useRelatedNews: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";
import { NewsArticleScreen } from "@/screens/news/NewsArticleScreen";
import { useArticle } from "@/hooks/useArticle";
import { useRelatedNews } from "@/hooks/useRelatedNews";
import { strings } from "@/i18n";
import type { NewsDTO } from "@shared/types";

const aMock = useArticle as unknown as jest.Mock;
const relMock = useRelatedNews as unknown as jest.Mock;

const article = (over: Partial<NewsDTO> = {}): NewsDTO => ({
  id: "n1",
  title: "Parlament Europejski",
  summary: "Rezolucja w sprawie praw.",
  body: "Pełna treść artykułu redakcyjnego.",
  category: "world",
  source: "Blis-Q Redakcja",
  sourceUrl: null,
  imageUrl: null,
  featured: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

function renderScreen(
  over: Partial<ReturnType<typeof useArticle>> = {},
  routeParams: { id: string; fromHome?: boolean } = { id: "n1" },
  related: Partial<ReturnType<typeof useRelatedNews>> = {},
): {
  navigate: jest.Mock;
  goBack: jest.Mock;
  push: jest.Mock;
} {
  aMock.mockReturnValue({
    article: article(),
    status: "ready" as const,
    retry: jest.fn(),
    ...over,
  });
  relMock.mockReturnValue({
    items: [],
    status: "ready" as const,
    ...related,
  });
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    push: jest.fn(),
  };
  render(
    <NewsArticleScreen
      navigation={navigation as never}
      route={{ params: routeParams } as never}
    />,
  );
  return navigation;
}

beforeEach(() => {
  aMock.mockReset();
  relMock.mockReset();
});

describe("NewsArticleScreen", () => {
  it("editorial mode: renders the full body + a read-time, no source CTA", () => {
    renderScreen({ article: article({ body: "Pełna treść redakcyjna." }) });
    expect(screen.getByText("Pełna treść redakcyjna.")).toBeTruthy();
    expect(screen.getByText(/min czytania/)).toBeTruthy();
    expect(screen.queryByText(strings.news.openSource)).toBeNull();
  });

  it("external mode: renders the summary + 'Czytaj u źródła' → opens the source", () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as unknown as void);
    renderScreen({
      article: article({
        body: null,
        summary: "Streszczenie zewnętrzne.",
        sourceUrl: "https://oko.press",
      }),
    });
    expect(screen.getByText("Streszczenie zewnętrzne.")).toBeTruthy();
    // No read-time for an external item (no body).
    expect(screen.queryByText(/min czytania/)).toBeNull();
    fireEvent.press(screen.getByText(strings.news.openSource));
    expect(openURL).toHaveBeenCalledWith("https://oko.press");
    openURL.mockRestore();
  });

  it("external mode with no link: no CTA, no crash", () => {
    renderScreen({
      article: article({ body: null, summary: "Bez linku.", sourceUrl: null }),
    });
    expect(screen.getByText("Bez linku.")).toBeTruthy();
    expect(screen.queryByText(strings.news.openSource)).toBeNull();
  });

  it("the crisis-support callout opens the Crisis screen", () => {
    const nav = renderScreen();
    fireEvent.press(
      screen.getByRole("button", { name: strings.news.support.title }),
    );
    expect(nav.navigate).toHaveBeenCalledWith("Crisis");
  });

  it("the back button goes back to the feed when not opened from Home", () => {
    const nav = renderScreen(); // route params: { id } — fromHome unset
    fireEvent.press(screen.getByRole("button", { name: strings.crisis.back }));
    expect(nav.goBack).toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalledWith("Home");
  });

  it("Back returns to Home when opened from Home (fromHome)", () => {
    const nav = renderScreen({}, { id: "n1", fromHome: true });
    fireEvent.press(screen.getByRole("button", { name: strings.crisis.back }));
    expect(nav.navigate).toHaveBeenCalledWith("Home");
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  it("renders the real banner image when imageUrl is set (no gradient placeholder)", () => {
    renderScreen({
      article: article({ imageUrl: "https://signed.example/pic.jpg" }),
    });
    expect(screen.getByTestId("news-banner")).toBeTruthy();
    expect(screen.queryByTestId("news-banner-placeholder")).toBeNull();
  });

  it("falls back to the category gradient banner when imageUrl is null", () => {
    renderScreen({ article: article({ imageUrl: null }) });
    expect(screen.getByTestId("news-banner-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("news-banner")).toBeNull();
  });

  it("error state: shows the load error + a retry", () => {
    const retry = jest.fn();
    renderScreen({ article: null, status: "error", retry });
    expect(screen.getByText(strings.news.detailLoadError)).toBeTruthy();
    fireEvent.press(screen.getByText(strings.news.retry));
    expect(retry).toHaveBeenCalled();
  });

  it("shows the 'Więcej wiadomości' section and pushes a tapped related article", () => {
    const nav = renderScreen(
      {},
      { id: "n1" },
      {
        items: [article({ id: "n2", title: "Powiązana wiadomość" })],
        status: "ready",
      },
    );
    expect(screen.getByTestId("news-related")).toBeTruthy();
    expect(screen.getByText(strings.news.relatedTitle)).toBeTruthy();
    fireEvent.press(screen.getByText("Powiązana wiadomość"));
    // push (not navigate) → Back returns to the current article.
    expect(nav.push).toHaveBeenCalledWith("NewsArticle", { id: "n2" });
    expect(nav.navigate).not.toHaveBeenCalledWith("NewsArticle", { id: "n2" });
  });

  it("hides the related section when there are no related items", () => {
    renderScreen({}, { id: "n1" }, { items: [], status: "ready" });
    expect(screen.queryByTestId("news-related")).toBeNull();
    expect(screen.queryByText(strings.news.relatedTitle)).toBeNull();
  });
});
