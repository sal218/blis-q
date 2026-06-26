import { render, screen, fireEvent } from "@testing-library/react-native";
import { SectionHeader } from "@/components/SectionHeader";
import { strings } from "@/i18n";

describe("SectionHeader", () => {
  it("renders the title", () => {
    render(<SectionHeader title="Twoje społeczności" />);
    expect(screen.getByText("Twoje społeczności")).toBeTruthy();
  });

  it("shows 'See all' and fires onSeeAll when provided", () => {
    const onSeeAll = jest.fn();
    render(<SectionHeader title="X" onSeeAll={onSeeAll} />);
    fireEvent.press(screen.getByRole("button", { name: strings.home.seeAll }));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  it("hides 'See all' when onSeeAll is not provided", () => {
    render(<SectionHeader title="X" />);
    expect(
      screen.queryByRole("button", { name: strings.home.seeAll }),
    ).toBeNull();
  });
});
