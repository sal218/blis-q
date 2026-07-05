import { render, screen, fireEvent } from "@testing-library/react-native";
import { SafePlaceCard } from "@/components/SafePlaceCard";
import { strings } from "@/i18n";
import type { SafePlaceDTO } from "@shared/types";

const place = (over: Partial<SafePlaceDTO> = {}): SafePlaceDTO => ({
  id: "s1",
  name: "Tęczowa Kawiarnia",
  category: "cafe",
  description: null,
  address: "Marszałkowska 10",
  city: "Warszawa",
  latitude: 52.23,
  longitude: 21.01,
  imageUrl: null,
  accessibilityFeatures: [],
  saved: false,
  ...over,
});

describe("SafePlaceCard", () => {
  it("renders the name, category label and address/city", () => {
    render(<SafePlaceCard place={place()} />);
    expect(screen.getByText("Tęczowa Kawiarnia")).toBeTruthy();
    expect(screen.getByText(strings.safePlaces.categories.cafe)).toBeTruthy();
    expect(screen.getByText("Marszałkowska 10, Warszawa")).toBeTruthy();
  });

  it("never shows coordinates (privacy — display-only)", () => {
    render(<SafePlaceCard place={place()} />);
    expect(screen.queryByText(/52\.23/)).toBeNull();
    expect(screen.queryByText(/21\.01/)).toBeNull();
  });

  it("shows just the city when there is no address", () => {
    render(<SafePlaceCard place={place({ address: null })} />);
    expect(screen.getByText("Warszawa")).toBeTruthy();
  });

  it("omits the location row when neither address nor city is set", () => {
    render(<SafePlaceCard place={place({ address: null, city: null })} />);
    expect(screen.queryByText("Warszawa")).toBeNull();
  });

  it("renders the venue photo when imageUrl is set", () => {
    render(<SafePlaceCard place={place({ imageUrl: "https://r2/signed" })} />);
    const img = screen.getByTestId("safe-place-thumb");
    expect(img.props.source).toEqual({ uri: "https://r2/signed" });
    expect(screen.queryByTestId("safe-place-thumb-placeholder")).toBeNull();
  });

  it("shows a placeholder square when there is no image", () => {
    render(<SafePlaceCard place={place({ imageUrl: null })} />);
    expect(screen.getByTestId("safe-place-thumb-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("safe-place-thumb")).toBeNull();
  });

  it("tapping the card body fires onPress with the place", () => {
    const onPress = jest.fn();
    const p = place();
    render(<SafePlaceCard place={p} onPress={onPress} />);
    fireEvent.press(screen.getByText("Tęczowa Kawiarnia"));
    expect(onPress).toHaveBeenCalledWith(p);
  });

  it("tapping the bookmark toggles save WITHOUT firing the card onPress", () => {
    const onPress = jest.fn();
    const onToggleSave = jest.fn();
    const p = place();
    render(
      <SafePlaceCard place={p} onPress={onPress} onToggleSave={onToggleSave} />,
    );
    fireEvent.press(screen.getByLabelText(strings.safePlaces.saveAction));
    expect(onToggleSave).toHaveBeenCalledWith(p);
    expect(onPress).not.toHaveBeenCalled(); // the nested Pressable captures the tap
  });

  it("shows no bookmark when onToggleSave is omitted (display-only)", () => {
    render(<SafePlaceCard place={place()} />);
    expect(screen.queryByLabelText(strings.safePlaces.saveAction)).toBeNull();
    expect(screen.queryByLabelText(strings.safePlaces.savedAction)).toBeNull();
  });

  it("renders an interactive bookmark that fires onToggleSave", () => {
    const onToggleSave = jest.fn();
    const p = place({ saved: false });
    render(<SafePlaceCard place={p} onToggleSave={onToggleSave} />);
    // Not-yet-saved → the "Zapisz" label.
    fireEvent.press(screen.getByLabelText(strings.safePlaces.saveAction));
    expect(onToggleSave).toHaveBeenCalledWith(p);
  });

  it("labels the bookmark 'Zapisano' when already saved", () => {
    render(
      <SafePlaceCard place={place({ saved: true })} onToggleSave={jest.fn()} />,
    );
    expect(screen.getByLabelText(strings.safePlaces.savedAction)).toBeTruthy();
  });
});
