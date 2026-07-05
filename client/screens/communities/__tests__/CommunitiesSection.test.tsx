jest.mock("@/lib/api/communities", () => ({ listCommunities: jest.fn() }));
jest.mock("@react-navigation/bottom-tabs", () => ({
  useBottomTabBarHeight: () => 60,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { FlatList } from "react-native";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { CommunitiesSection } from "@/screens/communities/CommunitiesSection";
import { listCommunities } from "@/lib/api/communities";
import { strings } from "@/i18n";

const listMock = listCommunities as unknown as jest.Mock;

type Membership = { role: "member" | "moderator" | "admin" } | null;

const community = (
  id: string,
  name: string,
  membership: Membership = null,
) => ({
  id,
  name,
  description: null,
  imageUrl: null,
  memberCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  membership,
});

const page = (
  items: ReturnType<typeof community>[],
  { page = 1, totalPages = 1 } = {},
) => ({
  ok: true as const,
  data: { data: items, page, pageSize: 20, total: items.length, totalPages },
});

function renderSection(
  onOpenCommunity = jest.fn(),
  onCreateCommunity = jest.fn(),
  onCreateEvent = jest.fn(),
) {
  render(
    <CommunitiesSection
      onOpenCommunity={onOpenCommunity}
      onCreateCommunity={onCreateCommunity}
      onCreateEvent={onCreateEvent}
    />,
  );
  return { onOpenCommunity, onCreateCommunity, onCreateEvent };
}

beforeEach(() => listMock.mockReset());

describe("CommunitiesSection", () => {
  it("renders communities after the initial load", async () => {
    listMock.mockResolvedValue(
      page([
        community("c1", "Queer Creatives"),
        community("c2", "Trans Support"),
      ]),
    );
    renderSection();
    expect(await screen.findByText("Queer Creatives")).toBeTruthy();
    expect(screen.getByText("Trans Support")).toBeTruthy();
  });

  it("shows the empty state when there are no communities", async () => {
    listMock.mockResolvedValue(page([]));
    renderSection();
    expect(await screen.findByText(strings.communities.empty)).toBeTruthy();
  });

  it("shows an error state and retries", async () => {
    listMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: "network" },
    });
    renderSection();
    expect(await screen.findByText(strings.errors.network)).toBeTruthy();

    listMock.mockResolvedValueOnce(page([community("c1", "Queer Creatives")]));
    fireEvent.press(
      screen.getByRole("button", { name: strings.communities.retry }),
    );
    expect(await screen.findByText("Queer Creatives")).toBeTruthy();
  });

  it("searching refetches page 1 with the (debounced) search param", async () => {
    listMock.mockResolvedValue(page([community("c1", "Queer Creatives")]));
    renderSection();
    await screen.findByText("Queer Creatives");

    fireEvent.changeText(
      screen.getByLabelText(strings.communities.searchPlaceholder),
      "trans",
    );

    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, search: "trans" }),
      ),
    );
  });

  it("loads the next page on end-reached and appends results", async () => {
    listMock.mockImplementation(async ({ page: p }: { page: number }) =>
      p === 1
        ? page([community("c1", "First")], { page: 1, totalPages: 2 })
        : page([community("c2", "Second")], { page: 2, totalPages: 2 }),
    );
    renderSection();
    await screen.findByText("First");

    const list = screen.UNSAFE_getByType(FlatList);
    await act(async () => {
      list.props.onEndReached();
    });

    expect(await screen.findByText("Second")).toBeTruthy();
    expect(screen.getByText("First")).toBeTruthy();
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("opens a community when its card is pressed", async () => {
    const onOpen = jest.fn();
    listMock.mockResolvedValue(page([community("c1", "Queer Creatives")]));
    renderSection(onOpen);
    fireEvent.press(
      await screen.findByRole("button", { name: "Queer Creatives" }),
    );
    expect(onOpen).toHaveBeenCalledWith("c1");
  });

  it("the big create button is gone; the FAB reveals both create options", async () => {
    listMock.mockResolvedValue(page([]));
    renderSection();
    await screen.findByText(strings.communities.empty);

    // Options are hidden (from touch + the a11y tree) until the FAB is tapped.
    expect(
      screen.queryByRole("button", { name: strings.communities.create }),
    ).toBeNull();
    fireEvent.press(screen.getByTestId("communities-fab"));
    expect(
      screen.getByRole("button", { name: strings.communities.create }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: strings.communities.createEvent }),
    ).toBeTruthy();
  });

  it("the FAB 'create community' option fires onCreateCommunity", async () => {
    const onCreateCommunity = jest.fn();
    listMock.mockResolvedValue(page([]));
    renderSection(jest.fn(), onCreateCommunity);
    await screen.findByText(strings.communities.empty);
    fireEvent.press(screen.getByTestId("communities-fab"));
    fireEvent.press(screen.getByTestId("fab-create-community"));
    expect(onCreateCommunity).toHaveBeenCalled();
  });

  it("the FAB 'create event' option opens the community picker; picking fires onCreateEvent", async () => {
    const onCreateEvent = jest.fn();
    // A joined community so the picker has a pickable row.
    listMock.mockResolvedValue(
      page([community("c1", "Trans Support", { role: "member" })]),
    );
    renderSection(jest.fn(), jest.fn(), onCreateEvent);
    await screen.findByText("Trans Support");

    fireEvent.press(screen.getByTestId("communities-fab"));
    fireEvent.press(screen.getByTestId("fab-create-event"));

    // The picker sheet opens and lists the joined community; pick it.
    expect(
      await screen.findByText(strings.communities.pickCommunityTitle),
    ).toBeTruthy();
    const list = await screen.findByTestId("community-picker-list");
    const row = list.props.data.find((c: { id: string }) => c.id === "c1");
    expect(row).toBeTruthy();
    fireEvent.press(
      screen.getAllByRole("button", { name: "Trans Support" })[1],
    );
    expect(onCreateEvent).toHaveBeenCalledWith("c1");
  });

  it("the picker shows an empty state when the user has no joined communities", async () => {
    // Non-member community → nothing joined.
    listMock.mockResolvedValue(page([community("c1", "Queer Creatives")]));
    renderSection();
    await screen.findByText("Queer Creatives");
    fireEvent.press(screen.getByTestId("communities-fab"));
    fireEvent.press(screen.getByTestId("fab-create-event"));
    expect(
      await screen.findByText(strings.communities.pickCommunityEmpty),
    ).toBeTruthy();
  });

  // Regression: an older search response that resolves AFTER a newer one must
  // not overwrite the newer results (stale-response guard).
  it("drops a stale response that resolves after a newer one", async () => {
    const deferred: { resolveOld?: (value: unknown) => void } = {};
    listMock.mockImplementation(({ search }: { search?: string }) => {
      if (search === "old") {
        return new Promise((resolve) => {
          deferred.resolveOld = resolve;
        });
      }
      if (search === "new") {
        return Promise.resolve(page([community("n", "NEW")]));
      }
      return Promise.resolve(page([community("i", "INIT")]));
    });

    renderSection();
    await screen.findByText("INIT");

    const input = screen.getByLabelText(strings.communities.searchPlaceholder);

    // Older search fires and stays in flight (unresolved).
    fireEvent.changeText(input, "old");
    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: "old" }),
      ),
    );

    // Newer search fires and resolves first.
    fireEvent.changeText(input, "new");
    await screen.findByText("NEW");

    // The stale "old" response now resolves — it must NOT replace "NEW".
    await act(async () => {
      deferred.resolveOld?.(page([community("o", "OLD")]));
    });

    expect(screen.queryByText("OLD")).toBeNull();
    expect(screen.getByText("NEW")).toBeTruthy();
  });
});
