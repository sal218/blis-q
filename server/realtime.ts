import type { MessageDTO } from "@shared/types";

// Server → client live delivery for community chat (TRANSFER §3.9).
//
// Flow: the route persists the message to PostgreSQL (durable source of truth),
// then calls this helper to publish it on the community's chat channel so
// subscribers render it without a re-fetch. History is loaded over HTTP (the
// GET endpoint); Realtime only carries messages that arrive after a screen
// opens. Persistence is authoritative — broadcasting is best-effort (the route
// never fails a send because delivery failed).
//
// Transport: Supabase Realtime's stateless HTTP broadcast endpoint, called with
// the service-role key. We deliberately avoid opening a long-lived websocket
// from the (stateless, multi-instance) Express server.
//
// Channel: `chat:{communityId}`, marked PRIVATE. Subscription authorization
// (members only) is enforced when the CLIENT subscribes, via Supabase Realtime
// Authorization — see the mobile chat slice and docs/API.md §9. This helper only
// PUBLISHES; the service role is authorized to broadcast to any topic.
//
// Compliance: message content rides the payload (plaintext by design — E2EE was
// rejected so moderation can act, COMPLIANCE §5.6) but is NEVER logged. On
// failure the caller logs an error code only — never the payload.

export function chatChannel(communityId: string): string {
  return `chat:${communityId}`;
}

// Publish a new message on the community's private chat channel. Throws on a
// non-2xx response so the caller's best-effort wrapper can swallow it; the throw
// message carries the HTTP status only (never the message content).
export async function broadcastNewMessage(
  communityId: string,
  message: MessageDTO,
): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const url = `${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: chatChannel(communityId),
          event: "new_message",
          payload: message,
          private: true,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`realtime broadcast failed: ${res.status}`);
  }
}
