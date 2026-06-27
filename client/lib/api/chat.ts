import type { CursorPage, MessageDTO, ChatSummaryDTO } from "@shared/types";
import { request, commonApiError } from "@/lib/api/http";

// Typed client for community chat (docs/API.md §9). Screens/hooks go through
// these — never fetch directly. History is HTTP (cursor, newest-first); live
// delivery is Supabase Realtime Broadcast (see client/lib/supabase.ts +
// useCommunityChat). Read AND write are member-gated by the server.

export type ChatApiError =
  | { kind: "validation" } // 400 (e.g. empty/whitespace message)
  | { kind: "forbidden" } // 403 — non-member read, or delete not permitted
  | { kind: "notFound" } // 404 — community/message missing, deleted, or not visible
  | { kind: "rateLimited"; retryAfter: number } // 429
  | { kind: "server" } // 5xx / unexpected
  | { kind: "network" }; // fetch threw

export type ChatResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ChatApiError };

// 403/404 are chat-specific (non-member/forbidden; missing/deleted/not-visible);
// 400/429/5xx delegate to the shared mapper.
async function toChatError(res: Response): Promise<ChatApiError> {
  if (res.status === 403) return { kind: "forbidden" };
  if (res.status === 404) return { kind: "notFound" };
  return commonApiError(res);
}

// GET /api/v1/chats — the caller's Messages inbox: their community chats, each
// with a last-message preview. Unpaginated (a user is in few communities).
export function listChats(): Promise<ChatResult<ChatSummaryDTO[]>> {
  return request(
    "GET",
    "/api/v1/chats",
    undefined,
    (res) => res.json() as Promise<ChatSummaryDTO[]>,
    toChatError,
  );
}

// GET /api/v1/communities/:id/messages — newest-first, cursor-paginated. Pass the
// previous page's nextCursor for older messages; omit for the first page.
export function listCommunityMessages(
  communityId: string,
  cursor?: string,
): Promise<ChatResult<CursorPage<MessageDTO>>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request(
    "GET",
    `/api/v1/communities/${communityId}/messages${query}`,
    undefined,
    (res) => res.json() as Promise<CursorPage<MessageDTO>>,
    toChatError,
  );
}

// POST /api/v1/communities/:id/messages — send a message (members only). Returns
// 201 with the created MessageDTO. 403 = not a member; 404 = community gone.
export function sendMessage(
  communityId: string,
  content: string,
): Promise<ChatResult<MessageDTO>> {
  return request(
    "POST",
    `/api/v1/communities/${communityId}/messages`,
    { content },
    (res) => res.json() as Promise<MessageDTO>,
    toChatError,
  );
}

// DELETE /api/v1/messages/:id — delete a message (sender, or community mod/admin).
// 403 = not permitted; 404 = missing/already-deleted.
export function deleteMessage(
  messageId: string,
): Promise<ChatResult<{ ok: true }>> {
  return request(
    "DELETE",
    `/api/v1/messages/${messageId}`,
    undefined,
    async () => ({ ok: true }) as const,
    toChatError,
  );
}

// POST /api/v1/messages/:id/report — flag a message for moderation. 201 on
// success. 404 = not a visible message. The reason is free text; kept out of logs.
export function reportMessage(
  messageId: string,
  reason: string,
): Promise<ChatResult<{ ok: true }>> {
  return request(
    "POST",
    `/api/v1/messages/${messageId}/report`,
    { reason },
    async () => ({ ok: true }) as const,
    toChatError,
  );
}
