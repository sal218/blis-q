import { render, screen } from "@testing-library/react-native";
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
});
