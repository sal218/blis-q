import type { CursorPage, PostDTO } from "@shared/types";
import { request, commonApiError } from "@/lib/api/http";

// Typed client for the community posts feed (docs/API.md §8). Screens go through
// these functions, never fetch directly: list a community's posts (cursor-
// paginated), report a post, create a post (members), and delete a post (author/
// mod — own-post deletion in the UI this slice).

export type PostsApiError =
  | { kind: "validation" } // 400
  | { kind: "forbidden" } // 403 — create: not a member; delete: not author/mod
  | { kind: "notFound" } // 404 — community missing/deleted, or post not visible
  | { kind: "rateLimited"; retryAfter: number } // 429
  | { kind: "server" } // 5xx / unexpected
  | { kind: "network" }; // fetch threw

export type PostsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PostsApiError };

// 403/404 are posts-specific (forbidden create/delete; missing/deleted community
// or not-visible post); 400/429/5xx delegate to the shared mapper.
async function toPostsError(res: Response): Promise<PostsApiError> {
  if (res.status === 403) return { kind: "forbidden" };
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

// POST /api/v1/communities/:id/posts — create a post (members only). Returns 201
// with the created PostDTO. 403 = not a member; 404 = community missing/deleted.
export function createPost(
  communityId: string,
  content: string,
): Promise<PostsResult<PostDTO>> {
  return request(
    "POST",
    `/api/v1/communities/${communityId}/posts`,
    { content },
    (res) => res.json() as Promise<PostDTO>,
    toPostsError,
  );
}

// DELETE /api/v1/posts/:id — delete a post. The UI exposes this for the caller's
// OWN posts this slice; the API also allows community mods/admins. 403 = not
// permitted; 404 = missing/already-deleted.
export function deletePost(postId: string): Promise<PostsResult<{ ok: true }>> {
  return request(
    "DELETE",
    `/api/v1/posts/${postId}`,
    undefined,
    async () => ({ ok: true }) as const,
    toPostsError,
  );
}
