jest.mock("@/hooks/useResources", () => ({ useResources: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react-native";
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

const renderHub = (nav: { navigate: jest.Mock }) =>
  render(<ResourcesScreen navigation={nav as never} route={{} as never} />);

beforeEach(() => rMock.mockReset());

describe("ResourcesScreen (hub)", () => {
  it("renders the header, subtitle and all 6 category cards", () => {
    rMock.mockReturnValue(state());
    renderHub({ navigate: jest.fn() });
    expect(screen.getByText(strings.resources.title)).toBeTruthy();
    expect(screen.getByText(strings.resources.subtitle)).toBeTruthy();
    expect(screen.getByText(strings.resources.categoriesHeader)).toBeTruthy();
    expect(
      screen.getByText(strings.resources.categories.mental_health),
    ).toBeTruthy();
    expect(
      screen.getByText(strings.resources.categories.education_careers),
    ).toBeTruthy();
  });

  it("shows the featured strip only when there are featured resources", () => {
    // No featured → the section (and its header) is absent.
    rMock.mockReturnValue(
      state({ items: [resource({ id: "r1", featured: false })] }),
    );
    const { rerender } = renderHub({ navigate: jest.fn() });
    expect(screen.queryByText(strings.resources.featuredTitle)).toBeNull();

    rMock.mockReturnValue(
      state({
        items: [resource({ id: "r1", title: "Trevor", featured: true })],
      }),
    );
    rerender(
      <ResourcesScreen
        navigation={{ navigate: jest.fn() } as never}
        route={{} as never}
      />,
    );
    expect(screen.getByText(strings.resources.featuredTitle)).toBeTruthy();
    expect(screen.getByText("Trevor")).toBeTruthy();
  });

  it("shows a skeleton while the featured strip is loading", () => {
    rMock.mockReturnValue(state({ status: "loading", items: [] }));
    renderHub({ navigate: jest.fn() });
    expect(screen.getByTestId("card-list-skeleton")).toBeTruthy();
  });

  it("a category card navigates to the list preselected to that category", () => {
    rMock.mockReturnValue(state());
    const nav = { navigate: jest.fn() };
    renderHub(nav);
    fireEvent.press(
      screen.getByText(strings.resources.categories.legal_rights),
    );
    expect(nav.navigate).toHaveBeenCalledWith("ResourcesList", {
      category: "legal_rights",
    });
  });

  it("the search box and 'view all' navigate to the full list", () => {
    rMock.mockReturnValue(state());
    const nav = { navigate: jest.fn() };
    renderHub(nav);
    fireEvent.press(screen.getByText(strings.resources.searchPlaceholder));
    expect(nav.navigate).toHaveBeenCalledWith("ResourcesList", {});

    fireEvent.press(screen.getByText(strings.resources.viewAll));
    expect(nav.navigate).toHaveBeenCalledWith("ResourcesList", {});
  });

  it("a featured card opens the detail screen", () => {
    rMock.mockReturnValue(
      state({
        items: [resource({ id: "r9", title: "ILGA", featured: true })],
      }),
    );
    const nav = { navigate: jest.fn() };
    renderHub(nav);
    fireEvent.press(screen.getByText("ILGA"));
    expect(nav.navigate).toHaveBeenCalledWith("ResourceDetail", { id: "r9" });
  });
});
