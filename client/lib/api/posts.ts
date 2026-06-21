import type { CursorPage, PostDTO } from "@shared/types";
import { request, commonApiError } from "@/lib/api/http";

// Typed client for the community posts feed + report (docs/API.md §8). Screens
// go through these functions, never fetch directly. Read-only this slice: list a
// community's posts (cursor-paginated) and report a post. Create/delete are a
// later slice.

export type PostsApiError =
  | { kind: "validation" } // 400
  | { kind: "notFound" } // 404 — community missing/deleted, or post not visible
  | { kind: "rateLimited"; retryAfter: number } // 429
  | { kind: "server" } // 5xx / unexpected
  | { kind: "network" }; // fetch threw

export type PostsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PostsApiError };

// 404 is posts-specific (missing/deleted community on list; not-visible post on
// report); 400/429/5xx delegate to the shared mapper.
async function toPostsError(res: Response): Promise<PostsApiError> {
  if (res.status === 404) return { kind: "notFound" };
  return commonApiError(res);
}

// GET /api/v1/communities/:id/posts — newest-first, cursor-paginated. Pass the
// previous page's nextCursor to fetch the next page; omit for the first page.
export function listCommunityPosts(
  communityId: string,
  cursor?: string,
): Promise<PostsResult<CursorPage<PostDTO>>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request(
    "GET",
    `/api/v1/communities/${communityId}/posts${query}`,
    undefined,
    (res) => res.json() as Promise<CursorPage<PostDTO>>,
    toPostsError,
  );
}

// POST /api/v1/posts/:id/report — flag a post for moderation. Returns 201 on
// success (request() treats any res.ok as success). The reason is free text;
// the UI keeps it out of logs and minimises PII in the copy.
export function reportPost(
  postId: string,
  reason: string,
): Promise<PostsResult<{ ok: true }>> {
  return request(
    "POST",
    `/api/v1/posts/${postId}/report`,
    { reason },
    async () => ({ ok: true }) as const,
    toPostsError,
  );
}
