jest.mock("@/hooks/useSavedSafePlaces", () => ({
  useSavedSafePlaces: jest.fn(),
}));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { SavedSafePlacesList } from "@/screens/events/SavedSafePlacesList";
import { useSavedSafePlaces } from "@/hooks/useSavedSafePlaces";
import { strings } from "@/i18n";
import type { SafePlaceDTO } from "@shared/types";

const savedMock = useSavedSafePlaces as unknown as jest.Mock;

const place = (id: string, name: string): SafePlaceDTO => ({
  id,
  name,
  category: "cafe",
  description: null,
  address: null,
  city: "Warszawa",
  latitude: null,
  longitude: null,
  saved: true,
});

beforeEach(() => savedMock.mockReset());

describe("SavedSafePlacesList", () => {
  it("renders saved place cards; the bookmark unsaves via toggleSave", () => {
    const toggleSave = jest.fn();
    const p = place("s1", "Tęczowy Zakątek");
    savedMock.mockReturnValue({
      places: [p],
      status: "ready",
      toggleSave,
      retry: jest.fn(),
    });
    render(<SavedSafePlacesList />);

    expect(screen.getByText("Tęczowy Zakątek")).toBeTruthy();
    // The card's bookmark carries the "Zapisano" a11y label when saved.
    fireEvent.press(screen.getByLabelText(strings.safePlaces.savedAction));
    expect(toggleSave).toHaveBeenCalledWith(p);
  });

  it("shows the empty message when there are no saved places", () => {
    savedMock.mockReturnValue({
      places: [],
      status: "ready",
      toggleSave: jest.fn(),
      retry: jest.fn(),
    });
    render(<SavedSafePlacesList />);
    expect(screen.getByText(strings.safePlaces.savedEmpty)).toBeTruthy();
  });

  it("shows an error + retry when the load fails", () => {
    const retry = jest.fn();
    savedMock.mockReturnValue({
      places: [],
      status: "error",
      toggleSave: jest.fn(),
      retry,
    });
    render(<SavedSafePlacesList />);
    fireEvent.press(screen.getByText(strings.safePlaces.retry));
    expect(retry).toHaveBeenCalled();
  });
});
