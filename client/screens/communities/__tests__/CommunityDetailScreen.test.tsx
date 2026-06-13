jest.mock("@/lib/api/communities", () => ({
  getCommunity: jest.fn(),
  joinCommunity: jest.fn(),
  leaveCommunity: jest.fn(),
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
import { strings } from "@/i18n";

const getMock = getCommunity as unknown as jest.Mock;
const joinMock = joinCommunity as unknown as jest.Mock;
const leaveMock = leaveCommunity as unknown as jest.Mock;

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

function renderDetail() {
  const navigation = { setOptions: jest.fn(), replace: jest.fn() };
  render(
    <CommunityDetailScreen
      navigation={navigation as never}
      route={
        { key: "d", name: "CommunityDetail", params: { id: "c1" } } as never
      }
    />,
  );
  return { navigation };
}

beforeEach(() => {
  getMock.mockReset();
  joinMock.mockReset();
  leaveMock.mockReset();
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
});
