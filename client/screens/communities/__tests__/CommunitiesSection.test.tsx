jest.mock("@/lib/api/communities", () => ({ listCommunities: jest.fn() }));

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

function renderSection(onOpenCommunity = jest.fn(), onCreate = jest.fn()) {
  render(
    <CommunitiesSection
      onOpenCommunity={onOpenCommunity}
      onCreate={onCreate}
    />,
  );
  return { onOpenCommunity, onCreate };
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

  it("invokes onCreate from the create button", async () => {
    const onCreate = jest.fn();
    listMock.mockResolvedValue(page([]));
    renderSection(jest.fn(), onCreate);
    await screen.findByText(strings.communities.empty);
    fireEvent.press(
      screen.getByRole("button", { name: strings.communities.create }),
    );
    expect(onCreate).toHaveBeenCalled();
  });
});
