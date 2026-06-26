jest.mock("@/lib/api/communities", () => ({ listCommunities: jest.fn() }));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { displayName: "Sal" } }),
}));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { HomeScreen } from "@/screens/HomeScreen";
import { listCommunities } from "@/lib/api/communities";
import { strings, format } from "@/i18n";
import type { CommunityDTO } from "@shared/types";

const listMock = listCommunities as unknown as jest.Mock;

function community(over: Partial<CommunityDTO>): CommunityDTO {
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

function page(items: CommunityDTO[]) {
  return {
    ok: true as const,
    data: {
      data: items,
      page: 1,
      pageSize: 20,
      total: items.length,
      totalPages: 1,
    },
  };
}

function renderHome() {
  const navigation = { navigate: jest.fn() };
  render(
    <HomeScreen
      navigation={navigation as never}
      route={{ key: "h", name: "Home", params: undefined } as never}
    />,
  );
  return { navigation };
}

beforeEach(() => listMock.mockReset());

describe("HomeScreen", () => {
  it("greets the user and shows the placeholder section titles", async () => {
    listMock.mockResolvedValue(page([]));
    renderHome();

    expect(
      await screen.findByText(format(strings.home.greeting, { name: "Sal" })),
    ).toBeTruthy();
    expect(screen.getByText(strings.home.upcomingEvents)).toBeTruthy();
    expect(screen.getByText(strings.home.nearbyPlaces)).toBeTruthy();
    expect(screen.getByText(strings.home.latestActivity)).toBeTruthy();
  });

  it("shows only JOINED communities in the rail", async () => {
    listMock.mockResolvedValue(
      page([
        community({ id: "c1", name: "Queer Creatives" }),
        community({ id: "c2", name: "Not Joined", membership: null }),
      ]),
    );
    renderHome();

    expect(await screen.findByText("Queer Creatives")).toBeTruthy();
    expect(screen.queryByText("Not Joined")).toBeNull();
  });

  it("tapping a community deep-links into the Events stack", async () => {
    listMock.mockResolvedValue(
      page([community({ id: "c1", name: "Queer Creatives" })]),
    );
    const { navigation } = renderHome();

    fireEvent.press(
      await screen.findByRole("button", { name: "Queer Creatives" }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Events", {
      screen: "CommunityDetail",
      params: { id: "c1" },
    });
  });

  it("'See all' navigates to the Events tab", async () => {
    listMock.mockResolvedValue(page([]));
    const { navigation } = renderHome();

    fireEvent.press(
      await screen.findByRole("button", { name: strings.home.seeAll }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("Events", {
      screen: "EventsHome",
    });
  });
});
