jest.mock("@/hooks/useSafePlaces", () => ({ useSafePlaces: jest.fn() }));

import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { SafePlacesList } from "@/screens/events/SafePlacesList";
import { useSafePlaces } from "@/hooks/useSafePlaces";
import { strings } from "@/i18n";
import type { SafePlaceDTO } from "@shared/types";

const spMock = useSafePlaces as unknown as jest.Mock;

const place = (
  id: string,
  name: string,
  city: string | null,
): SafePlaceDTO => ({
  id,
  name,
  category: "cafe",
  description: null,
  address: null,
  city,
  latitude: null,
  longitude: null,
  imageUrl: null,
  accessibilityFeatures: [],
  saved: false,
});

function state(over: Partial<ReturnType<typeof useSafePlaces>> = {}) {
  return {
    items: [] as SafePlaceDTO[],
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

beforeEach(() => spMock.mockReset());

describe("SafePlacesList", () => {
  it("renders cards and the OSM attribution footer", () => {
    spMock.mockReturnValue(
      state({ items: [place("s1", "Miejsce Alpha", "Warszawa")] }),
    );
    render(<SafePlacesList />);
    expect(screen.getByText("Miejsce Alpha")).toBeTruthy();
    expect(screen.getByText(strings.safePlaces.attribution)).toBeTruthy();
    // ODbL: the exact "© OpenStreetMap contributors" string must render.
    expect(strings.safePlaces.attribution).toContain(
      "© OpenStreetMap contributors",
    );
  });

  it("shows the curation/safety-framing disclaimer up front", () => {
    spMock.mockReturnValue(state({ items: [] }));
    render(<SafePlacesList />);
    expect(screen.getByText(strings.safePlaces.disclaimer)).toBeTruthy();
  });

  it("renders the filter chip row: 'Wszystkie' + category labels", () => {
    spMock.mockReturnValue(state({ items: [] }));
    render(<SafePlacesList />);
    expect(screen.getByText(strings.safePlaces.filterAll)).toBeTruthy();
    expect(screen.getByText(strings.safePlaces.categories.cafe)).toBeTruthy();
    expect(screen.getByText(strings.safePlaces.categories.ngo)).toBeTruthy();
  });

  it("tapping a category chip calls setCategory; 'Wszystkie' clears it", () => {
    const setCategory = jest.fn();
    spMock.mockReturnValue(state({ category: "club", setCategory }));
    render(<SafePlacesList />);
    fireEvent.press(screen.getByText(strings.safePlaces.categories.bar));
    expect(setCategory).toHaveBeenCalledWith("bar");
    fireEvent.press(screen.getByText(strings.safePlaces.filterAll));
    expect(setCategory).toHaveBeenCalledWith(null);
  });

  it("submitting the search box applies the search immediately", () => {
    const setSearch = jest.fn();
    spMock.mockReturnValue(state({ setSearch }));
    render(<SafePlacesList />);
    const input = screen.getByPlaceholderText(
      strings.safePlaces.searchPlaceholder,
    );
    fireEvent.changeText(input, "Kraków");
    fireEvent(input, "submitEditing");
    expect(setSearch).toHaveBeenCalledWith("Kraków");
  });

  it("filters as you type (debounced) without submitting", () => {
    jest.useFakeTimers();
    const setSearch = jest.fn();
    spMock.mockReturnValue(state({ setSearch }));
    render(<SafePlacesList />);
    const input = screen.getByPlaceholderText(
      strings.safePlaces.searchPlaceholder,
    );
    fireEvent.changeText(input, "war");
    expect(setSearch).not.toHaveBeenCalledWith("war"); // not yet — debounced
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(setSearch).toHaveBeenCalledWith("war");
    jest.useRealTimers();
  });

  it("the clear (✕) button resets the box and the filter to the full list", () => {
    const setSearch = jest.fn();
    spMock.mockReturnValue(state({ setSearch }));
    render(<SafePlacesList />);
    const input = screen.getByPlaceholderText(
      strings.safePlaces.searchPlaceholder,
    );
    fireEvent.changeText(input, "Kraków");
    fireEvent.press(screen.getByLabelText(strings.safePlaces.clear));
    expect(input.props.value).toBe("");
    expect(setSearch).toHaveBeenCalledWith(""); // immediate reset
  });

  it("empty-copy precedence: plain / category / search", () => {
    spMock.mockReturnValue(state({ items: [] }));
    const { rerender } = render(<SafePlacesList />);
    expect(screen.getByText(strings.safePlaces.empty)).toBeTruthy();

    spMock.mockReturnValue(state({ items: [], category: "club" }));
    rerender(<SafePlacesList />);
    expect(screen.getByText(strings.safePlaces.emptyCategory)).toBeTruthy();

    spMock.mockReturnValue(state({ items: [], search: "Zzz" }));
    rerender(<SafePlacesList />);
    expect(screen.getByText(strings.safePlaces.emptySearch)).toBeTruthy();
  });

  it("shows the error state with a retry", () => {
    const retry = jest.fn();
    spMock.mockReturnValue(
      state({ items: [], status: "error", errorMessage: "Błąd", retry }),
    );
    render(<SafePlacesList />);
    fireEvent.press(screen.getByText(strings.safePlaces.retry));
    expect(retry).toHaveBeenCalled();
  });
});
