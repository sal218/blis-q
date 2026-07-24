jest.mock("@/hooks/useHomeCommunities", () => ({
  useHomeCommunities: jest.fn(),
}));
jest.mock("@/hooks/useHomeEvents", () => ({ useHomeEvents: jest.fn() }));
jest.mock("@/hooks/useHomeNews", () => ({ useHomeNews: jest.fn() }));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { displayName: "Sal" } }),
}));

import { render, screen, fireEvent } from "@testing-library/react-native";
import { HomeScreen } from "@/screens/HomeScreen";
import { useHomeCommunities } from "@/hooks/useHomeCommunities";
import { useHomeEvents } from "@/hooks/useHomeEvents";
import { useHomeNews } from "@/hooks/useHomeNews";
import { strings, format } from "@/i18n";
import type { CommunityDTO, EventDTO, NewsDTO } from "@shared/types";

const commMock = useHomeCommunities as unknown as jest.Mock;
const eventsMock = useHomeEvents as unknown as jest.Mock;
const newsMock = useHomeNews as unknown as jest.Mock;

function newsArticle(id: string, title: string): NewsDTO {
  return {
    id,
    title,
    summary: "…",
    body: "Treść",
    category: "world",
    source: "Blis-Q Redakcja",
    sourceUrl: null,
    imageUrl: null,
    featured: false,
    createdAt: "2026-06-01T00:00:00.000Z",
  };
}

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
    goingCount: 1,
    rsvp: { status: "going" },
    deleted: false,
    status: "active",
    cancelledAt: null,
    past: false,
    canCancel: false,
    saved: false,
    category: null,
  };
}

// Convenience: the three hook returns default to "ready" + empty; a test
// overrides just the rail it cares about.
function setCommunities(over: Partial<ReturnType<typeof useHomeCommunities>>) {
  commMock.mockReturnValue({
    communities: [],
    status: "ready" as const,
    retry: jest.fn(),
    ...over,
  });
}
function setEvents(over: Partial<ReturnType<typeof useHomeEvents>>) {
  eventsMock.mockReturnValue({
    events: [],
    status: "ready" as const,
    retry: jest.fn(),
    ...over,
  });
}
function setNews(over: Partial<ReturnType<typeof useHomeNews>>) {
  newsMock.mockReturnValue({
    news: [],
    status: "ready" as const,
    retry: jest.fn(),
    ...over,
  });
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
  commMock.mockReset();
  eventsMock.mockReset();
  newsMock.mockReset();
  setCommunities({});
  setEvents({});
  setNews({});
});

describe("HomeScreen", () => {
  it("shows the rail + event skeletons while the sections are loading", () => {
    setCommunities({ status: "loading" });
    setEvents({ status: "loading" });
    renderHome();
    expect(screen.getByTestId("rail-skeleton")).toBeTruthy();
    expect(screen.getByTestId("card-list-skeleton")).toBeTruthy();
  });

  it("greets the user and shows the section titles", () => {
    renderHome();
    expect(
      screen.getByText(format(strings.home.greeting, { name: "Sal" })),
    ).toBeTruthy();
    expect(screen.getByText(strings.home.upcomingEvents)).toBeTruthy();
    expect(screen.getByText(strings.home.news)).toBeTruthy();
    expect(screen.getByText(strings.home.nearbyPlaces)).toBeTruthy();
  });

  it("renders the joined communities from the hook", () => {
    setCommunities({
      communities: [community({ id: "c1", name: "Queer Creatives" })],
    });
    renderHome();
    expect(screen.getByText("Queer Creatives")).toBeTruthy();
  });

  it("tapping a community deep-links into the Events stack with fromHome", () => {
    setCommunities({
      communities: [community({ id: "c1", name: "Queer Creatives" })],
    });
    const { navigation } = renderHome();

    fireEvent.press(screen.getByRole("button", { name: "Queer Creatives" }));
    expect(navigation.navigate).toHaveBeenCalledWith("Events", {
      screen: "CommunityDetail",
      // fromHome so Back returns to Home (not the Events list beneath).
      params: { id: "c1", fromHome: true },
      initial: false,
    });
  });

  it("communities 'See all' navigates to the Events tab", () => {
    const { navigation } = renderHome();
    const seeAll = screen.getAllByRole("button", { name: strings.home.seeAll });
    fireEvent.press(seeAll[0]);
    expect(navigation.navigate).toHaveBeenCalledWith("Events", {
      screen: "EventsHome",
    });
  });

  it("the crisis-help button cross-navigates to the Resources/Crisis screen", () => {
    const { navigation } = renderHome();
    fireEvent.press(screen.getByRole("button", { name: strings.crisis.open }));
    expect(navigation.navigate).toHaveBeenCalledWith("Resources", {
      screen: "Crisis",
      initial: false,
    });
  });

  describe("upcoming events section", () => {
    it("renders the caller's events and opens one on tap (fromHome)", () => {
      setEvents({ events: [event("e1", "Pride Meetup")] });
      const { navigation } = renderHome();

      fireEvent.press(screen.getByRole("button", { name: "Pride Meetup" }));
      expect(navigation.navigate).toHaveBeenCalledWith("Events", {
        screen: "EventDetail",
        params: { id: "e1", fromHome: true },
        initial: false,
      });
    });

    it("shows the empty message when the caller has no upcoming events", () => {
      renderHome();
      expect(screen.getByText(strings.home.noUpcomingEvents)).toBeTruthy();
    });
  });

  describe("news section", () => {
    it("renders the latest news and cross-navigates into an article on tap", () => {
      setNews({ news: [newsArticle("n1", "Parlament UE")] });
      const { navigation } = renderHome();

      fireEvent.press(screen.getByText("Parlament UE"));
      expect(navigation.navigate).toHaveBeenCalledWith("Resources", {
        screen: "NewsArticle",
        params: { id: "n1", fromHome: true },
        initial: false,
      });
    });

    it("'See all' cross-navigates to the News feed", () => {
      const { navigation } = renderHome();
      const seeAll = screen.getAllByRole("button", {
        name: strings.home.seeAll,
      });
      fireEvent.press(seeAll[seeAll.length - 1]);
      expect(navigation.navigate).toHaveBeenCalledWith("Resources", {
        screen: "NewsFeed",
        initial: false,
      });
    });

    it("shows the empty message when there is no news", () => {
      renderHome();
      expect(screen.getByText(strings.home.noNews)).toBeTruthy();
    });
  });

  // A FAILED load must be distinct from empty: each rail shows an error card +
  // a retry that calls the hook's retry (not the empty placeholder).
  describe("rail error + retry", () => {
    it("communities rail: shows the error card and retries", () => {
      const retry = jest.fn();
      setCommunities({ status: "error", retry });
      renderHome();
      expect(screen.getByTestId("rail-error")).toBeTruthy();
      // Empty-state copy must NOT show on error.
      expect(screen.queryByText(strings.home.noCommunities)).toBeNull();
      fireEvent.press(screen.getByText(strings.home.retry));
      expect(retry).toHaveBeenCalled();
    });

    it("events rail: shows the error card and retries", () => {
      const retry = jest.fn();
      setEvents({ status: "error", retry });
      renderHome();
      expect(screen.getByTestId("rail-error")).toBeTruthy();
      expect(screen.queryByText(strings.home.noUpcomingEvents)).toBeNull();
      fireEvent.press(screen.getByText(strings.home.retry));
      expect(retry).toHaveBeenCalled();
    });

    it("news rail: shows the error card and retries", () => {
      const retry = jest.fn();
      setNews({ status: "error", retry });
      renderHome();
      expect(screen.getByTestId("rail-error")).toBeTruthy();
      expect(screen.queryByText(strings.home.noNews)).toBeNull();
      fireEvent.press(screen.getByText(strings.home.retry));
      expect(retry).toHaveBeenCalled();
    });
  });
});
