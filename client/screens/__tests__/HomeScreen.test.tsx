jest.mock("@/lib/api/communities", () => ({ listCommunities: jest.fn() }));
jest.mock("@/hooks/useHomeEvents", () => ({ useHomeEvents: jest.fn() }));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { displayName: "Sal" } }),
}));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { HomeScreen } from "@/screens/HomeScreen";
import { listCommunities } from "@/lib/api/communities";
import { useHomeEvents } from "@/hooks/useHomeEvents";
import { strings, format } from "@/i18n";
import type { CommunityDTO, EventDTO } from "@shared/types";

const listMock = listCommunities as unknown as jest.Mock;
const eventsMock = useHomeEvents as unknown as jest.Mock;

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

function event(id: string, title: string): EventDTO {
  return {
    id,
    communityId: "c1",
    title,
    description: null,
    location: "Warszawa",
    startsAt: "2026-07-04T16:00:00",
    endsAt: null,
    imageUrl: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    goingCount: 3,
    rsvp: { status: "going" },
    deleted: false,
    status: "active",
    cancelledAt: null,
    past: false,
    canCancel: false,
    saved: false,
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

beforeEach(() => {
  listMock.mockReset();
  eventsMock.mockReset();
  eventsMock.mockReturnValue({ events: [], status: "ready" });
});

describe("HomeScreen", () => {
  it("greets the user and shows the section titles", async () => {
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

  it("communities 'See all' navigates to the Events tab", async () => {
    listMock.mockResolvedValue(page([]));
    const { navigation } = renderHome();

    // Both the communities and events headers render "See all"; the first is
    // the communities one.
    const seeAll = await screen.findAllByRole("button", {
      name: strings.home.seeAll,
    });
    fireEvent.press(seeAll[0]);
    expect(navigation.navigate).toHaveBeenCalledWith("Events", {
      screen: "EventsHome",
    });
  });

  describe("upcoming events section", () => {
    it("renders the caller's events and opens one on tap", async () => {
      listMock.mockResolvedValue(page([]));
      eventsMock.mockReturnValue({
        events: [event("e1", "Pride Meetup")],
        status: "ready",
      });
      const { navigation } = renderHome();

      fireEvent.press(
        await screen.findByRole("button", { name: "Pride Meetup" }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith("Events", {
        screen: "EventDetail",
        params: { id: "e1" },
      });
    });

    it("shows the empty message when the caller has no upcoming events", () => {
      listMock.mockResolvedValue(page([]));
      eventsMock.mockReturnValue({ events: [], status: "ready" });
      renderHome();
      expect(screen.getByText(strings.home.noUpcomingEvents)).toBeTruthy();
    });
  });
});
