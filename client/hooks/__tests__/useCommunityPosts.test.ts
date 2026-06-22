jest.mock("@/lib/api/posts", () => ({
  listCommunityPosts: jest.fn(),
  reportPost: jest.fn(),
  createPost: jest.fn(),
  deletePost: jest.fn(),
}));

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useCommunityPosts } from "@/hooks/useCommunityPosts";
import { listCommunityPosts, createPost, deletePost } from "@/lib/api/posts";
import type { PostDTO } from "@shared/types";

const listMock = listCommunityPosts as unknown as jest.Mock;
const createMock = createPost as unknown as jest.Mock;
const deleteMock = deletePost as unknown as jest.Mock;

function post(id: string, content: string): PostDTO {
  return {
    id,
    communityId: "c1",
    author: { id: `u-${id}`, displayName: `A${id}`, avatarUrl: null },
    content,
    createdAt: new Date().toISOString(),
    imageUrl: null,
    deleted: false,
  };
}

const okPage = (items: PostDTO[], nextCursor: string | null) => ({
  ok: true as const,
  data: { data: items, nextCursor },
});

beforeEach(() => {
  listMock.mockReset();
  createMock.mockReset();
  deleteMock.mockReset();
});

async function ready() {
  const hook = renderHook(() => useCommunityPosts("c1"));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook;
}

describe("useCommunityPosts — mutations", () => {
  it("create prepends the returned post (functional updater)", async () => {
    listMock.mockResolvedValue(okPage([post("p1", "First")], null));
    const created = post("p9", "Brand new");
    createMock.mockResolvedValue({ ok: true, data: created });

    const { result } = await ready();
    await act(async () => {
      await result.current.create("Brand new");
    });

    expect(result.current.posts.map((p) => p.id)).toEqual(["p9", "p1"]);
  });

  it("create failure maps the error and does not mutate the list", async () => {
    listMock.mockResolvedValue(okPage([post("p1", "First")], null));
    createMock.mockResolvedValue({ ok: false, error: { kind: "forbidden" } });

    const { result } = await ready();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.create("x");
    });

    expect(outcome).toEqual({ ok: false, message: expect.any(String) });
    expect(result.current.posts.map((p) => p.id)).toEqual(["p1"]);
  });

  it("delete tombstones the post in place (functional updater)", async () => {
    listMock.mockResolvedValue(okPage([post("p1", "Mine")], null));
    deleteMock.mockResolvedValue({ ok: true, data: { ok: true } });

    const { result } = await ready();
    await act(async () => {
      await result.current.remove("p1");
    });

    const p = result.current.posts.find((x) => x.id === "p1")!;
    expect(p.deleted).toBe(true);
    expect(p.author).toBeNull();
    expect(p.content).toBe("[deleted]");
  });

  // Race: a refresh is in-flight when a create succeeds; the stale refresh
  // resolves LAST and must be dropped (created post preserved).
  it("drops a refresh that resolves after a create succeeds", async () => {
    let resolveRefresh!: (v: unknown) => void;
    listMock
      .mockResolvedValueOnce(okPage([post("i", "INIT")], null)) // initial
      .mockReturnValueOnce(
        new Promise((r) => {
          resolveRefresh = r;
        }),
      ); // refresh (deferred)
    const created = post("c", "CREATED");
    createMock.mockResolvedValue({ ok: true, data: created });

    const { result } = await ready();

    act(() => {
      result.current.refresh(); // start the deferred refresh
    });
    await act(async () => {
      await result.current.create("CREATED"); // succeeds, bumps seq, prepends
    });
    await act(async () => {
      resolveRefresh(okPage([post("r", "REFRESHED")], null)); // stale → dropped
    });

    const ids = result.current.posts.map((p) => p.id);
    expect(ids).toContain("c");
    expect(ids).toContain("i");
    expect(ids).not.toContain("r");
  });

  // Race: two creates resolve; both must survive (functional updater means the
  // second create doesn't clobber the first off a stale snapshot).
  it("applies two concurrent creates without losing either", async () => {
    listMock.mockResolvedValue(okPage([post("p1", "First")], null));
    createMock
      .mockResolvedValueOnce({ ok: true, data: post("a", "A") })
      .mockResolvedValueOnce({ ok: true, data: post("b", "B") });

    const { result } = await ready();
    await act(async () => {
      await Promise.all([
        result.current.create("A"),
        result.current.create("B"),
      ]);
    });

    const ids = result.current.posts.map((p) => p.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("p1");
    expect(ids).toHaveLength(3);
  });
});
