import { render, screen, fireEvent } from "@testing-library/react-native";
import { CommunityRailCard } from "@/components/CommunityRailCard";
import { strings, format } from "@/i18n";
import type { CommunityDTO } from "@shared/types";

function community(over: Partial<CommunityDTO> = {}): CommunityDTO {
  return {
    id: "c1",
    name: "Queer Creatives",
    description: null,
    imageUrl: null,
    memberCount: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    membership: { role: "member" },
    ...over,
  };
}

describe("CommunityRailCard", () => {
  it("renders the name and member count", () => {
    render(<CommunityRailCard community={community()} onPress={jest.fn()} />);
    expect(screen.getByText("Queer Creatives")).toBeTruthy();
    expect(
      screen.getByText(format(strings.communities.members, { count: 12 })),
    ).toBeTruthy();
  });

  it("press fires onPress with the community id", () => {
    const onPress = jest.fn();
    render(<CommunityRailCard community={community()} onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: "Queer Creatives" }));
    expect(onPress).toHaveBeenCalledWith("c1");
  });

  it("renders the name with an image present too (image branch)", () => {
    render(
      <CommunityRailCard
        community={community({ imageUrl: "https://example/x.png" })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText("Queer Creatives")).toBeTruthy();
  });
});
