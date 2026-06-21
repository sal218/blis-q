jest.mock("@/lib/api/posts", () => ({
  listCommunityPosts: jest.fn(),
  reportPost: jest.fn(),
}));

import { Alert, FlatList } from "react-native";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { CommunityFeed } from "@/screens/communities/CommunityFeed";
import { listCommunityPosts, reportPost } from "@/lib/api/posts";
import { strings } from "@/i18n";
import type { PostDTO } from "@shared/types";

const listMock = listCommunityPosts as unknown as jest.Mock;
const reportMock = reportPost as unknown as jest.Mock;

function post(
  id: string,
  content: string,
  over: Partial<PostDTO> = {},
): PostDTO {
  return {
    id,
    communityId: "c1",
    author: { id: `u-${id}`, displayName: `Author ${id}`, avatarUrl: null },
    content,
    createdAt: new Date().toISOString(),
    imageUrl: null,
    deleted: false,
    ...over,
  };
}

const okPage = (items: PostDTO[], nextCursor: string | null) => ({
  ok: true as const,
  data: { data: items, nextCursor },
});

beforeEach(() => {
  listMock.mockReset();
  reportMock.mockReset();
});

describe("CommunityFeed", () => {
  it("renders posts after the initial load", async () => {
    listMock.mockResolvedValue(okPage([post("p1", "Pierwszy wpis")], null));
    render(<CommunityFeed communityId="c1" />);
    expect(await screen.findByText("Pierwszy wpis")).toBeTruthy();
  });

  it("shows the empty state when there are no posts", async () => {
    listMock.mockResolvedValue(okPage([], null));
    render(<CommunityFeed communityId="c1" />);
    expect(await screen.findByText(strings.posts.empty)).toBeTruthy();
  });

  it("shows an error state and retries", async () => {
    listMock
      .mockResolvedValueOnce({ ok: false, error: { kind: "network" } })
      .mockResolvedValueOnce(okPage([post("p1", "Wrócił")], null));
    render(<CommunityFeed communityId="c1" />);

    expect(await screen.findByText(strings.errors.network)).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: strings.posts.retry }));
    expect(await screen.findByText("Wrócił")).toBeTruthy();
  });

  it("loads the next page on end-reached and stops at nextCursor null", async () => {
    listMock.mockImplementation(async (_id: string, cursor?: string) =>
      cursor
        ? okPage([post("p2", "Drugi")], null)
        : okPage([post("p1", "Pierwszy")], "cur-2"),
    );
    render(<CommunityFeed communityId="c1" />);
    await screen.findByText("Pierwszy");

    const list = screen.UNSAFE_getByType(FlatList);
    await act(async () => {
      list.props.onEndReached();
    });
    expect(await screen.findByText("Drugi")).toBeTruthy();
    expect(screen.getByText("Pierwszy")).toBeTruthy();

    // nextCursor is now null → a further end-reached must NOT fetch again.
    await act(async () => {
      list.props.onEndReached();
    });
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("renders a deleted post as a tombstone", async () => {
    listMock.mockResolvedValue(
      okPage([post("p1", "[deleted]", { author: null, deleted: true })], null),
    );
    render(<CommunityFeed communityId="c1" />);
    expect(await screen.findByText(strings.posts.deleted)).toBeTruthy();
  });

  // Stale-response guard: a load-more that resolves AFTER a refresh must be
  // dropped (no stale/duplicate append).
  it("drops a stale load-more that resolves after a refresh", async () => {
    let resolveMore!: (value: unknown) => void;
    listMock
      .mockResolvedValueOnce(okPage([post("i", "INIT")], "cur-2")) // initial
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveMore = resolve;
        }),
      ) // load-more (deferred)
      .mockResolvedValueOnce(okPage([post("r", "REFRESHED")], null)); // refresh

    render(<CommunityFeed communityId="c1" />);
    await screen.findByText("INIT");

    const list = screen.UNSAFE_getByType(FlatList);
    await act(async () => {
      list.props.onEndReached(); // start the (deferred) load-more
    });
    await act(async () => {
      list.props.refreshControl.props.onRefresh(); // refresh supersedes it
    });
    await screen.findByText("REFRESHED");

    await act(async () => {
      resolveMore(okPage([post("m", "STALE")], null)); // resolves late → dropped
    });

    expect(screen.queryByText("STALE")).toBeNull();
    expect(screen.queryByText("INIT")).toBeNull();
    expect(screen.getByText("REFRESHED")).toBeTruthy();
  });

  it("reports a post: ⋯ → reason → submit calls reportPost and confirms", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    listMock.mockResolvedValue(okPage([post("p1", "Wpis")], null));
    reportMock.mockResolvedValue({ ok: true, data: { ok: true } });
    render(<CommunityFeed communityId="c1" />);
    await screen.findByText("Wpis");

    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.moreActions }),
    );
    expect(screen.getByText(strings.posts.reportTitle)).toBeTruthy();

    fireEvent.changeText(
      screen.getByPlaceholderText(strings.posts.reportReasonPlaceholder),
      "spam",
    );
    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.reportSubmit }),
    );

    await waitFor(() => expect(reportMock).toHaveBeenCalledWith("p1", "spam"));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(strings.posts.reportSuccess),
    );
    alertSpy.mockRestore();
  });
});
