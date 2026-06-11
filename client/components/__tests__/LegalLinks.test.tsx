import { Linking } from "react-native";
import {
  render,
  screen,
  fireEvent,
} from "@testing-library/react-native";
import { LegalLinks } from "@/components/LegalLinks";
import { strings } from "@/i18n";

describe("LegalLinks", () => {
  it("when configured, renders tappable Terms + Privacy links that open the URLs", () => {
    const openSpy = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as never);
    const urls = {
      terms: "https://blis-q.example/regulamin",
      privacy: "https://blis-q.example/prywatnosc",
    };

    render(<LegalLinks configured urls={urls} />);

    fireEvent.press(screen.getByRole("link", { name: strings.consent.terms }));
    expect(openSpy).toHaveBeenCalledWith(urls.terms);

    fireEvent.press(screen.getByRole("link", { name: strings.consent.privacy }));
    expect(openSpy).toHaveBeenCalledWith(urls.privacy);

    openSpy.mockRestore();
  });

  it("when NOT configured, shows the honest fallback note and no links", () => {
    render(<LegalLinks configured={false} />);

    expect(screen.getByText(strings.consent.legalUnavailable)).toBeTruthy();
    expect(screen.queryByRole("link", { name: strings.consent.terms })).toBeNull();
  });
});
