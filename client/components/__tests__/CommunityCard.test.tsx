import { render, screen, fireEvent } from "@testing-library/react-native";
import { CommunityCard } from "@/components/CommunityCard";
import { strings, memberLabel } from "@/i18n";
import type { CommunityDTO } from "@shared/types";

const community = (over: Partial<CommunityDTO> = {}): CommunityDTO => ({
  id: "c1",
  name: "Queer Creatives",
  description: "A space for LGBTQ+ artists and creators.",
  imageUrl: null,
  memberCount: 1300,
  createdAt: "2026-01-01T00:00:00.000Z",
  membership: null,
  ...over,
});

describe("CommunityCard", () => {
  it("renders the name, member count and description", () => {
    render(<CommunityCard community={community()} onPress={jest.fn()} />);
    expect(screen.getByText("Queer Creatives")).toBeTruthy();
    expect(screen.getByText(memberLabel(1300))).toBeTruthy();
    expect(
      screen.getByText("A space for LGBTQ+ artists and creators."),
    ).toBeTruthy();
  });

  it("shows the 'Dołącz' pill for non-members", () => {
    render(
      <CommunityCard
        community={community({ membership: null })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText(strings.communities.join)).toBeTruthy();
    expect(screen.queryByText(strings.communities.joined)).toBeNull();
  });

  it("shows the 'Dołączono' pill for members", () => {
    render(
      <CommunityCard
        community={community({ membership: { role: "member" } })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText(strings.communities.joined)).toBeTruthy();
  });

  it("renders the uploaded image when imageUrl is set (no placeholder)", () => {
    render(
      <CommunityCard
        community={community({ imageUrl: "https://cdn/x.png" })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByTestId("community-thumb")).toBeTruthy();
    expect(screen.queryByTestId("community-thumb-placeholder")).toBeNull();
  });

  it("renders the gradient placeholder (with the initial) when there is no image", () => {
    render(<CommunityCard community={community()} onPress={jest.fn()} />);
    expect(screen.getByTestId("community-thumb-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("community-thumb")).toBeNull();
    expect(screen.getByText("Q")).toBeTruthy(); // first letter
  });

  it("tapping the card fires onPress with the community id (no inline join)", () => {
    const onPress = jest.fn();
    render(<CommunityCard community={community()} onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: "Queer Creatives" }));
    expect(onPress).toHaveBeenCalledWith("c1");
  });
});
