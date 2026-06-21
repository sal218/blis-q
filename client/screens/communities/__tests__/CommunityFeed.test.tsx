jest.mock("@/lib/api/posts", () => ({
  listCommunityPosts: jest.fn(),
  reportPost: jest.fn(),
  createPost: jest.fn(),
  deletePost: jest.fn(),
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
import {
  listCommunityPosts,
  reportPost,
  createPost,
  deletePost,
} from "@/lib/api/posts";
import { strings } from "@/i18n";
import type { PostDTO } from "@shared/types";

const listMock = listCommunityPosts as unknown as jest.Mock;
const reportMock = reportPost as unknown as jest.Mock;
const createMock = createPost as unknown as jest.Mock;
const deleteMock = deletePost as unknown as jest.Mock;

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

const owned = (id: string, content: string, userId: string) =>
  post(id, content, {
    author: { id: userId, displayName: "Me", avatarUrl: null },
  });

const okPage = (items: PostDTO[], nextCursor: string | null) => ({
  ok: true as const,
  data: { data: items, nextCursor },
});

function renderFeed(
  opts: { canCompose?: boolean; currentUserId?: string | null } = {},
) {
  // Respect an explicit `currentUserId: null` (??-default would coerce it to "me").
  const currentUserId =
    "currentUserId" in opts ? (opts.currentUserId ?? null) : "me";
  return render(
    <CommunityFeed
      communityId="c1"
      canCompose={opts.canCompose ?? false}
      currentUserId={currentUserId}
    />,
  );
}

beforeEach(() => {
  listMock.mockReset();
  reportMock.mockReset();
  createMock.mockReset();
  deleteMock.mockReset();
});

describe("CommunityFeed — list states", () => {
  it("renders posts after the initial load", async () => {
    listMock.mockResolvedValue(okPage([post("p1", "Pierwszy wpis")], null));
    renderFeed();
    expect(await screen.findByText("Pierwszy wpis")).toBeTruthy();
  });

  it("shows the empty state when there are no posts", async () => {
    listMock.mockResolvedValue(okPage([], null));
    renderFeed();
    expect(await screen.findByText(strings.posts.empty)).toBeTruthy();
  });

  it("shows an error state and retries", async () => {
    listMock
      .mockResolvedValueOnce({ ok: false, error: { kind: "network" } })
      .mockResolvedValueOnce(okPage([post("p1", "Wrócił")], null));
    renderFeed();
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
    renderFeed();
    await screen.findByText("Pierwszy");

    const list = screen.UNSAFE_getByType(FlatList);
    await act(async () => {
      list.props.onEndReached();
    });
    expect(await screen.findByText("Drugi")).toBeTruthy();

    await act(async () => {
      list.props.onEndReached();
    });
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("renders a deleted post as a tombstone", async () => {
    listMock.mockResolvedValue(
      okPage([post("p1", "[deleted]", { author: null, deleted: true })], null),
    );
    renderFeed();
    expect(await screen.findByText(strings.posts.deleted)).toBeTruthy();
  });
});

describe("CommunityFeed — compose gating", () => {
  it("hides compose when canCompose is false", async () => {
    listMock.mockResolvedValue(okPage([post("p1", "X")], null));
    renderFeed({ canCompose: false, currentUserId: "me" });
    await screen.findByText("X");
    expect(
      screen.queryByRole("button", { name: strings.posts.compose }),
    ).toBeNull();
  });

  it("hides compose when canCompose is true but currentUserId is null", async () => {
    listMock.mockResolvedValue(okPage([post("p1", "X")], null));
    renderFeed({ canCompose: true, currentUserId: null });
    await screen.findByText("X");
    expect(
      screen.queryByRole("button", { name: strings.posts.compose }),
    ).toBeNull();
  });

  it("shows compose and prepends the new post on success", async () => {
    listMock.mockResolvedValue(okPage([post("p1", "Stary")], null));
    createMock.mockResolvedValue({ ok: true, data: post("p9", "Świeży wpis") });
    renderFeed({ canCompose: true, currentUserId: "me" });
    await screen.findByText("Stary");

    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.compose }),
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(strings.posts.composePlaceholder),
      "Świeży wpis",
    );
    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.composeSubmit }),
    );

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith("c1", "Świeży wpis"),
    );
    expect(await screen.findByText("Świeży wpis")).toBeTruthy();
  });
});

describe("CommunityFeed — ⋯ actions", () => {
  it("own post → sheet offers Report and Delete; others' → Report only", async () => {
    listMock.mockResolvedValue(
      okPage([owned("p1", "Mój wpis", "me"), post("p2", "Cudzy")], null),
    );
    renderFeed({ canCompose: false, currentUserId: "me" });
    await screen.findByText("Mój wpis");

    const menus = screen.getAllByRole("button", {
      name: strings.posts.moreActions,
    });
    // First post is the own one.
    fireEvent.press(menus[0]);
    expect(
      screen.getByRole("button", { name: strings.posts.report }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: strings.posts.delete }),
    ).toBeTruthy();
    fireEvent.press(
      screen.getByRole("button", { name: strings.common.cancel }),
    );

    fireEvent.press(menus[1]); // the other user's post
    expect(
      screen.getByRole("button", { name: strings.posts.report }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: strings.posts.delete }),
    ).toBeNull();
  });

  it("report: ⋯ → Report → reason → submit calls reportPost", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    listMock.mockResolvedValue(okPage([post("p1", "Wpis")], null));
    reportMock.mockResolvedValue({ ok: true, data: { ok: true } });
    renderFeed({ canCompose: false, currentUserId: "me" });
    await screen.findByText("Wpis");

    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.moreActions }),
    );
    fireEvent.press(screen.getByRole("button", { name: strings.posts.report }));
    fireEvent.changeText(
      screen.getByPlaceholderText(strings.posts.reportReasonPlaceholder),
      "spam",
    );
    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.reportSubmit }),
    );

    await waitFor(() => expect(reportMock).toHaveBeenCalledWith("p1", "spam"));
    alertSpy.mockRestore();
  });

  it("delete own post: ⋯ → Delete → confirm → tombstone", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    listMock.mockResolvedValue(okPage([owned("p1", "Mój wpis", "me")], null));
    deleteMock.mockResolvedValue({ ok: true, data: { ok: true } });
    renderFeed({ canCompose: false, currentUserId: "me" });
    await screen.findByText("Mój wpis");

    fireEvent.press(
      screen.getByRole("button", { name: strings.posts.moreActions }),
    );
    fireEvent.press(screen.getByRole("button", { name: strings.posts.delete }));

    // confirmDelete → Alert.alert(title, body, buttons); invoke the destructive one.
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as
      | { text: string; style?: string; onPress?: () => void }[]
      | undefined;
    const destructive = buttons?.find((b) => b.style === "destructive");
    await act(async () => {
      await destructive?.onPress?.();
    });

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("p1"));
    expect(await screen.findByText(strings.posts.deleted)).toBeTruthy();
    alertSpy.mockRestore();
  });
});
