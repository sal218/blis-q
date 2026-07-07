import { render, screen, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";
import { ResourceCard } from "@/components/ResourceCard";
import type { ResourceDTO } from "@shared/types";

const resource = (over: Partial<ResourceDTO> = {}): ResourceDTO => ({
  id: "r1",
  title: "Telefon zaufania",
  category: "mental_health",
  body: "Bezpłatna, anonimowa linia wsparcia.",
  url: "https://example.org",
  featured: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

describe("ResourceCard", () => {
  it("renders the title, a body snippet and the category icon", () => {
    render(<ResourceCard resource={resource()} />);
    expect(screen.getByText("Telefon zaufania")).toBeTruthy();
    expect(
      screen.getByText("Bezpłatna, anonimowa linia wsparcia."),
    ).toBeTruthy();
    expect(screen.getByTestId("resource-icon")).toBeTruthy();
  });

  it("tapping the card calls onPress with the resource — and never opens the link directly", () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as unknown as void);
    const onPress = jest.fn();
    const r = resource({ url: "https://example.org" });
    render(<ResourceCard resource={r} onPress={onPress} />);

    fireEvent.press(screen.getByText("Telefon zaufania"));
    expect(onPress).toHaveBeenCalledWith(r);
    // A resource WITH a url must still route to the detail screen (via onPress),
    // never jump straight to an external browser from the list.
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });
});
