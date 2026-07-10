import { render, screen, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";
import { CrisisContactCard, telUrl } from "@/components/CrisisContactCard";
import type { CrisisContactDTO } from "@shared/types";

function contact(over: Partial<CrisisContactDTO> = {}): CrisisContactDTO {
  return {
    id: "c1",
    name: "Telefon zaufania",
    phone: "800 70 2222",
    description: "Wsparcie w kryzysie emocjonalnym.",
    hours: "Całodobowo",
    category: "emotional_crisis",
    verified: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

describe("telUrl", () => {
  it("strips formatting to digits and a single leading +", () => {
    expect(telUrl("800 70 2222")).toBe("tel:800702222");
    expect(telUrl("+48 22 628 52 22")).toBe("tel:+48226285222");
    expect(telUrl("112")).toBe("tel:112");
    // A non-leading "+" is dropped (not a valid international prefix).
    expect(telUrl("48+22 628")).toBe("tel:4822628");
  });
});

describe("CrisisContactCard", () => {
  it("renders the name, phone, description and hours pill", () => {
    render(<CrisisContactCard contact={contact()} />);
    expect(screen.getByText(/Telefon zaufania/)).toBeTruthy();
    expect(screen.getByText(/800 70 2222/)).toBeTruthy();
    expect(screen.getByText("Wsparcie w kryzysie emocjonalnym.")).toBeTruthy();
    expect(screen.getByText("Całodobowo")).toBeTruthy();
  });

  it("hides the hours pill when hours is null", () => {
    render(<CrisisContactCard contact={contact({ hours: null })} />);
    expect(screen.queryByText("Całodobowo")).toBeNull();
  });

  it("tap-to-call opens a tel: link with the digits-stripped phone", () => {
    const spy = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as never);
    render(<CrisisContactCard contact={contact()} />);
    fireEvent.press(screen.getByLabelText(/Zadzwoń/));
    expect(spy).toHaveBeenCalledWith("tel:800702222");
    spy.mockRestore();
  });
});
