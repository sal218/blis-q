import { storage } from "./storage";

export type NotificationType =
  | "friend_request"
  | "friend_request_accepted"
  | "new_expense"
  | "settlement_recorded"
  | "recurring_expense_inserted"
  | "group_recurring_template_created"
  | "group_recurring_expense_inserted"
  | "group_recurring_template_paused";

interface NotificationMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

function buildMessage(
  type: NotificationType,
  payload: Record<string, string>,
): NotificationMessage {
  switch (type) {
    case "friend_request":
      return {
        title: "New Friend Request",
        body: `${payload.senderName ?? "Someone"} sent you a friend request`,
        data: { type, senderId: payload.senderId ?? "" },
      };
    case "friend_request_accepted":
      return {
        title: "Friend Request Accepted",
        body: `${payload.receiverName ?? "Someone"} accepted your friend request`,
        data: { type, receiverId: payload.receiverId ?? "" },
      };
    case "new_expense":
      return {
        title: `New expense in ${payload.groupName ?? "your group"}`,
        body: `${payload.payerName ?? "Someone"} added "${payload.description ?? "an expense"}" (${payload.currency ?? ""} ${payload.amount ?? ""})`,
        data: {
          type,
          expenseId: payload.expenseId ?? "",
          groupId: payload.groupId ?? "",
        },
      };
    case "settlement_recorded":
      return {
        title: "Payment Recorded",
        body: `${payload.fromName ?? "Someone"} recorded a payment of ${payload.currency ?? ""} ${payload.amount ?? ""} to ${payload.toName ?? "you"}`,
        data: {
          type,
          settlementId: payload.settlementId ?? "",
          groupId: payload.groupId ?? "",
        },
      };
    case "recurring_expense_inserted":
      return {
        title: "Recurring Expense Added",
        body: `${payload.note ?? "A recurring expense"} (${payload.currency ?? ""} ${payload.amount ?? ""}) has been automatically added`,
        data: { type, expenseId: payload.expenseId ?? "" },
      };
    case "group_recurring_template_created":
      return {
        title: `New recurring expense in ${payload.groupName ?? "your group"}`,
        body: `${payload.creatorName ?? "Someone"} set up "${payload.description ?? "a recurring expense"}" — ${payload.currency ?? ""} ${payload.amount ?? ""} on the ${payload.billingLabel ?? "billing day"} each month`,
        data: {
          type,
          templateId: payload.templateId ?? "",
          groupId: payload.groupId ?? "",
        },
      };
    case "group_recurring_expense_inserted":
      return {
        title: `Recurring expense added in ${payload.groupName ?? "your group"}`,
        body: `"${payload.description ?? "An expense"}" (${payload.currency ?? ""} ${payload.amount ?? ""}) was automatically added`,
        data: {
          type,
          expenseId: payload.expenseId ?? "",
          groupId: payload.groupId ?? "",
        },
      };
    case "group_recurring_template_paused":
      return {
        title: "Recurring expense paused",
        body: `"${payload.description ?? "A recurring expense"}" in ${payload.groupName ?? "your group"} was paused${payload.reason ? ` — ${payload.reason}` : ""}. Tap to review.`,
        data: {
          type,
          templateId: payload.templateId ?? "",
          groupId: payload.groupId ?? "",
        },
      };
    default:
      return { title: "Even Tab", body: "You have a new notification" };
  }
}

/** Maps a notification type to its preference key. Returns null for types with no preference gate. */
function preferenceKey(
  type: NotificationType,
):
  | "newExpense"
  | "settlementRecorded"
  | "friendRequest"
  | "recurringExpenseInserted"
  | "groupRecurringExpenseInserted"
  | null {
  switch (type) {
    case "friend_request":
    case "friend_request_accepted":
      return "friendRequest";
    case "new_expense":
      return "newExpense";
    case "settlement_recorded":
      return "settlementRecorded";
    case "recurring_expense_inserted":
      return "recurringExpenseInserted";
    case "group_recurring_expense_inserted":
      return "groupRecurringExpenseInserted";
    // Always-on types — no preference gate
    case "group_recurring_template_created":
    case "group_recurring_template_paused":
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
    console.error(
      "[Notifications] Unhandled error sending to user",
      userId,
      err,
    );
  }
}

/**
 * Send a push notification to all active members of a group, except one user.
 * Useful for broadcasting expense/settlement events to the whole group.
 */
export async function notifyGroupMembers(
  groupId: string,
  exceptUserId: string,
  type: NotificationType,
  payload: Record<string, string>,
): Promise<void> {
  try {
    const members = await storage.getGroupMembers(groupId);
    const targets = members.filter((m) => m.userId !== exceptUserId);
    await Promise.all(targets.map((m) => notifyUser(m.userId, type, payload)));
  } catch (err) {
    console.error(
      "[Notifications] Error notifying group members for group",
      groupId,
      err,
    );
  }
}
