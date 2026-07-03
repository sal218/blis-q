import { storage } from "./storage";
import { safeErrorCode } from "./errorCode";

export type NotificationType =
  | "new_community_post"
  | "new_event"
  | "event_reminder"
  | "community_invite"
  | "new_member_joined"
  | "moderation_action";

interface NotificationMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// User-facing copy is in Polish (Blis-Q's primary market). Gendered verbs use
// the "(a)" suffix convention since the actor's gender is unknown. Names in
// payloads are public display-name aliases — never real names (anonymity model).
function buildMessage(
  type: NotificationType,
  payload: Record<string, string>,
): NotificationMessage {
  switch (type) {
    case "new_community_post":
      return {
        title: `Nowy post w ${payload.communityName ?? "społeczności"}`,
        body: `${payload.authorName ?? "Ktoś"} opublikował(a) nowy post`,
        data: {
          type,
          communityId: payload.communityId ?? "",
          postId: payload.postId ?? "",
        },
      };
    case "new_event":
      return {
        title: `Nowe wydarzenie w ${payload.communityName ?? "społeczności"}`,
        body: `${payload.eventTitle ?? "Nowe wydarzenie"}${payload.eventDate ? ` — ${payload.eventDate}` : ""}`,
        data: {
          type,
          communityId: payload.communityId ?? "",
          eventId: payload.eventId ?? "",
        },
      };
    case "event_reminder":
      return {
        title: "Przypomnienie o wydarzeniu",
        body: `${payload.eventTitle ?? "Twoje wydarzenie"} wkrótce się rozpocznie`,
        data: { type, eventId: payload.eventId ?? "" },
      };
    case "community_invite":
      return {
        title: "Zaproszenie do społeczności",
        body: `${payload.inviterName ?? "Ktoś"} zaprosił(a) Cię do ${payload.communityName ?? "społeczności"}`,
        data: {
          type,
          communityId: payload.communityId ?? "",
        },
      };
    case "new_member_joined":
      return {
        title: `Nowy członek w ${payload.communityName ?? "społeczności"}`,
        body: `${payload.memberName ?? "Ktoś"} dołączył(a) do społeczności`,
        data: {
          type,
          communityId: payload.communityId ?? "",
          memberId: payload.memberId ?? "",
        },
      };
    case "moderation_action":
      return {
        title: "Działanie moderacyjne",
        body:
          payload.message ??
          "Podjęto działanie moderacyjne dotyczące Twojej treści.",
        data: {
          type,
          resourceType: payload.resourceType ?? "",
          resourceId: payload.resourceId ?? "",
        },
      };
    default:
      return { title: "Blis-Q", body: "Masz nowe powiadomienie" };
  }
}

/**
 * Maps a notification type to its preference key (a boolean column on
 * notification_preferences). Returns null for always-on types that the user
 * cannot opt out of — currently moderation_action, since a user must always
 * be told when a moderation decision affects them.
 */
function preferenceKey(
  type: NotificationType,
):
  | "communityPosts"
  | "events"
  | "eventReminders"
  | "communityInvites"
  | "memberJoins"
  | null {
  switch (type) {
    case "new_community_post":
      return "communityPosts";
    case "new_event":
      return "events";
    case "event_reminder":
      return "eventReminders";
    case "community_invite":
      return "communityInvites";
    case "new_member_joined":
      return "memberJoins";
    // Always-on — no preference gate.
    case "moderation_action":
      return null;
    default:
      return null;
  }
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPushNotifications(
  tokens: string[],
  msg: NotificationMessage,
): Promise<string[]> {
  const messages = tokens.map((token) => ({
    to: token,
    sound: "default" as const,
    title: msg.title,
    body: msg.body,
    data: msg.data ?? {},
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });

  if (!res.ok) return [];

  const json = (await res.json()) as {
    data: { status: string; details?: { error?: string } }[];
  };
  const staleTokens: string[] = [];
  json.data?.forEach((ticket, idx) => {
    if (
      ticket.status === "error" &&
      (ticket.details?.error === "DeviceNotRegistered" ||
        ticket.details?.error === "InvalidCredentials")
    ) {
      staleTokens.push(tokens[idx]);
    } else if (ticket.status === "error") {
      console.warn(
        `[Notifications] Expo push error for token ${idx}:`,
        ticket.details?.error,
      );
    }
  });
  return staleTokens;
}

/**
 * Send a push notification to a single user via Expo's push service.
 * - Respects the user's notification preferences.
 * - Sends to ALL active push tokens (fan-out for multi-device support).
 * - Deactivates tokens that Expo reports as DeviceNotRegistered.
 * - Never throws.
 */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  payload: Record<string, string>,
): Promise<void> {
  try {
    const prefKey = preferenceKey(type);
    if (prefKey) {
      const prefs = await storage.getNotificationPreferences(userId);
      if (!prefs[prefKey]) return;
    }

    const activeTokens = await storage.getActiveTokensForUser(userId);
    if (activeTokens.length === 0) return;

    const msg = buildMessage(type, payload);
    const staleTokens = await sendExpoPushNotifications(
      activeTokens.map((t) => t.token),
      msg,
    );

    if (staleTokens.length > 0) {
      await storage.deactivatePushTokensByList(staleTokens);
      console.log(
        `[Notifications] Deactivated ${staleTokens.length} stale token(s) for user ${userId}`,
      );
    }
  } catch (err) {
    console.error("[Notifications] Unhandled error sending to user", userId, {
      code: safeErrorCode(err),
    });
  }
}

/**
 * Send a push notification to all active members of a community, except one
 * user (typically the actor who triggered the event — they don't need to be
 * notified of their own action). Used for new posts, events, and member joins.
 */
export async function notifyCommunityMembers(
  communityId: string,
  exceptUserId: string,
  type: NotificationType,
  payload: Record<string, string>,
): Promise<void> {
  try {
    const members = await storage.getCommunityMembers(communityId);
    const targets = members.filter((m) => m.userId !== exceptUserId);
    await Promise.all(targets.map((m) => notifyUser(m.userId, type, payload)));
  } catch (err) {
    console.error(
      "[Notifications] Error notifying community members for community",
      communityId,
      { code: safeErrorCode(err) },
    );
  }
}
