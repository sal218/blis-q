jest.mock("@/lib/api/communities", () => ({
  getCommunity: jest.fn(),
  joinCommunity: jest.fn(),
  leaveCommunity: jest.fn(),
}));

// The screen now reads useAuth() (for canCompose/currentUserId) and mounts
// CommunityFeed on the Tablica tab — mock both boundaries.
let mockUser: { id: string } | null = { id: "me" };
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock("@/lib/api/posts", () => ({
  listCommunityPosts: jest.fn(),
  reportPost: jest.fn(),
  createPost: jest.fn(),
  deletePost: jest.fn(),
}));

import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { CommunityDetailScreen } from "@/screens/communities/CommunityDetailScreen";
import {
  getCommunity,
  joinCommunity,
  leaveCommunity,
} from "@/lib/api/communities";
import { listCommunityPosts } from "@/lib/api/posts";
import { strings } from "@/i18n";

const getMock = getCommunity as unknown as jest.Mock;
const joinMock = joinCommunity as unknown as jest.Mock;
const leaveMock = leaveCommunity as unknown as jest.Mock;
const listPostsMock = listCommunityPosts as unknown as jest.Mock;

type Membership = { role: "member" | "moderator" | "admin" } | null;

const community = (membership: Membership) => ({
  id: "c1",
  name: "Queer Creatives",
  description: "A welcoming space.",
  imageUrl: null,
  memberCount: 12,
  createdAt: "2026-01-01T00:00:00.000Z",
  membership,
});

function renderDetail(
  params: { id: string; fromHome?: boolean } = { id: "c1" },
) {
  const navigation = {
    setOptions: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
  };
  render(
    <CommunityDetailScreen
      navigation={navigation as never}
      route={{ key: "d", name: "CommunityDetail", params } as never}
    />,
  );
  return { navigation };
}

beforeEach(() => {
  getMock.mockReset();
  joinMock.mockReset();
  leaveMock.mockReset();
  listPostsMock.mockReset();
  listPostsMock.mockResolvedValue({
    ok: true,
    data: { data: [], nextCursor: null },
  });
  mockUser = { id: "me" };
});

describe("CommunityDetailScreen", () => {
  it("shows the not-found copy and a retry when the load fails", async () => {
    getMock.mockResolvedValue({ ok: false, error: { kind: "notFound" } });
    renderDetail();
    expect(await screen.findByText(strings.communities.notFound)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: strings.communities.retry }),
    ).toBeTruthy();
  });

  it("joins a non-member community and reflects membership", async () => {
    getMock
      .mockResolvedValueOnce({ ok: true, data: community(null) })
      .mockResolvedValueOnce({
        ok: true,
        data: community({ role: "member" }),
      });
    joinMock.mockResolvedValue({ ok: true, data: { role: "member" } });

    renderDetail();
    fireEvent.press(
      await screen.findByRole("button", { name: strings.communities.join }),
    );

    expect(
      await screen.findByRole("button", { name: strings.communities.leave }),
    ).toBeTruthy();
    expect(joinMock).toHaveBeenCalledWith("c1");
  });

  it("member sees the Create-event entry → navigates to CreateEvent", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: community({ role: "member" }),
    });
    const { navigation } = renderDetail();
    fireEvent.press(
      await screen.findByRole("button", { name: strings.events.createCta }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith("CreateEvent", {
      communityId: "c1",
    });
  });

  it("non-member does not see the Create-event entry", async () => {
    getMock.mockResolvedValue({ ok: true, data: community(null) });
    renderDetail();
    await screen.findByRole("button", { name: strings.communities.join });
    expect(
      screen.queryByRole("button", { name: strings.events.createCta }),
    ).toBeNull();
  });

  it("shows the sole-admin copy when leaving conflicts (409)", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: community({ role: "admin" }),
    });
    leaveMock.mockResolvedValue({ ok: false, error: { kind: "conflict" } });

    renderDetail();
    fireEvent.press(
      await screen.findByRole("button", { name: strings.communities.leave }),
    );

    await waitFor(() =>
      expect(screen.getByText(strings.communities.leaveSoleAdmin)).toBeTruthy(),
    );
  });

  // canCompose wiring: compose appears on the Feed tab only for a member with a
  // resolved identity.
  async function openFeedTab() {
    fireEvent.press(
      await screen.findByRole("tab", { name: strings.posts.tabFeed }),
    );
    // Feed reaches its empty (ready) state — compose can now render.
    await screen.findByText(strings.posts.empty);
  }

  it("member + user → compose on the Feed tab", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: community({ role: "member" }),
    });
    mockUser = { id: "me" };
    renderDetail();
    await openFeedTab();
    expect(
      screen.getByRole("button", { name: strings.posts.compose }),
    ).toBeTruthy();
  });

  it("non-member → no compose on the Feed tab", async () => {
    getMock.mockResolvedValue({ ok: true, data: community(null) });
    mockUser = { id: "me" };
    renderDetail();
    await openFeedTab();
    expect(
      screen.queryByRole("button", { name: strings.posts.compose }),
    ).toBeNull();
  });

  it("member but no resolved user → no compose on the Feed tab", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: community({ role: "member" }),
    });
    mockUser = null;
    renderDetail();
    await openFeedTab();
    expect(
      screen.queryByRole("button", { name: strings.posts.compose }),
    ).toBeNull();
  });

  // canModerate wiring: a community moderator/admin sees Delete on ANOTHER
  // author's post; a plain member does not. Exercises the full derivation
  // (role → canModerate) and propagation (screen → feed → ⋯ sheet).
  const othersPost = {
    id: "p1",
    communityId: "c1",
    author: { id: "other", displayName: "Ktoś", avatarUrl: null },
    content: "Cudzy wpis",
    createdAt: new Date().toISOString(),
    imageUrl: null,
    deleted: false,
  };

  async function openFeedAndMenu() {
    fireEvent.press(
      await screen.findByRole("tab", { name: strings.posts.tabFeed }),
    );
    await screen.findByText("Cudzy wpis");
    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.moreActions }),
    );
  }

  it("moderator → Delete shown on another author's post", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: community({ role: "moderator" }),
    });
    listPostsMock.mockResolvedValue({
      ok: true,
      data: { data: [othersPost], nextCursor: null },
    });
    mockUser = { id: "me" };
    renderDetail();
    await openFeedAndMenu();
    expect(
      screen.getByRole("button", { name: strings.posts.delete }),
    ).toBeTruthy();
  });

  it("plain member → no Delete on another author's post", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: community({ role: "member" }),
    });
    listPostsMock.mockResolvedValue({
      ok: true,
      data: { data: [othersPost], nextCursor: null },
    });
    mockUser = { id: "me" };
    renderDetail();
    await openFeedAndMenu();
    expect(
      screen.queryByRole("button", { name: strings.posts.delete }),
    ).toBeNull();
  });

  describe("Back navigation (fromHome)", () => {
    it("Back returns to Home when opened from Home", async () => {
      getMock.mockResolvedValue({
        ok: true,
        data: community({ role: "member" }),
      });
      const { navigation } = renderDetail({ id: "c1", fromHome: true });
      fireEvent.press(
        await screen.findByRole("button", { name: strings.common.back }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith("Home");
      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it("Back returns to the list when NOT opened from Home", async () => {
      getMock.mockResolvedValue({
        ok: true,
        data: community({ role: "member" }),
      });
      const { navigation } = renderDetail({ id: "c1" });
      fireEvent.press(
        await screen.findByRole("button", { name: strings.common.back }),
      );
      expect(navigation.goBack).toHaveBeenCalled();
      expect(navigation.navigate).not.toHaveBeenCalledWith("Home");
    });
  });
});
