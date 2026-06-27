import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { MessageRow, ChatSummaryRow } from "../storage";
import {
  createMessageSchema,
  messageReportSchema,
  cursorPageQuerySchema,
} from "../validation";
import {
  checkContentCreateRateLimit,
  checkReportRateLimit,
} from "../rateLimit";
import { broadcastNewMessage } from "../realtime";
import { encodeCursor, decodeCursor } from "../cursor";
import type { MessageDTO, CursorPage, ChatSummaryDTO } from "@shared/types";

// Community chat (docs/API.md §9). Hybrid: HTTP for persistence + history,
// Supabase Realtime Broadcast for live delivery. Every route is isAuthenticated.
// Chat is the in-group conversation, so read AND write are MEMBER-gated (stricter
// than posts, whose reads are open). Messages are plaintext (moderation, no E2EE
// — §5.6); message content is NEVER logged. Send persists then broadcasts on the
// community's private channel, post-commit + best-effort (a broadcast failure
// must never fail the send).
export function registerChatRoutes(app: Express): void {
  app.get("/api/v1/chats", isAuthenticated, handleListChats);
  app.get("/api/v1/communities/:id/messages", isAuthenticated, handleList);
  app.post("/api/v1/communities/:id/messages", isAuthenticated, handleCreate);
  app.delete("/api/v1/messages/:id", isAuthenticated, handleDelete);
  app.post("/api/v1/messages/:id/report", isAuthenticated, handleReport);
}

// Messages inbox: the caller's community chats + a last-message preview. Reuses
// toMessageDTO so a deleted last message is masked exactly like in the thread.
function toChatSummaryDTO(row: ChatSummaryRow): ChatSummaryDTO {
  return {
    community: {
      id: row.communityId,
      name: row.communityName,
      imageUrl: row.communityImageUrl,
    },
    role: row.role,
    lastMessage: row.lastMessage ? toMessageDTO(row.lastMessage) : null,
  };
}

async function handleListChats(req: Request, res: Response): Promise<Response> {
  try {
    const rows = await storage.listUserChats(req.user!.id);
    const body: ChatSummaryDTO[] = rows.map(toChatSummaryDTO);
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/chats]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Deleted messages are returned as tombstones: content "[deleted]", sender null.
function toMessageDTO(row: MessageRow): MessageDTO {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    communityId: row.communityId,
    sender:
      deleted || !row.senderId
        ? null
        : {
            id: row.senderId,
            displayName: row.senderDisplayName ?? "",
            avatarUrl: row.senderAvatarUrl,
          },
    content: deleted ? "[deleted]" : row.content,
    createdAt: row.createdAt.toISOString(),
    deleted,
  };
}

function parseId(req: Request): string | null {
  const parsed = z.string().uuid().safeParse(req.params.id);
  return parsed.success ? parsed.data : null;
}

async function handleList(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    // Reads require a non-deleted community AND membership.
    if (!(await storage.communityExists(id))) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!(await storage.isCommunityMember(id, userId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const q = cursorPageQuerySchema.parse(req.query); // lenient: ignores extras
    let cursor: { createdAt: Date; id: string } | undefined;
    if (q.cursor) {
      const decoded = decodeCursor(q.cursor);
      if (!decoded) return res.status(400).json({ error: "Invalid input" });
      cursor = decoded;
    }

    const { rows, nextCursor } = await storage.listMessages({
      communityId: id,
      callerId: userId,
      limit: q.limit,
      cursor,
    });

    const body: CursorPage<MessageDTO> = {
      data: rows.map(toMessageDTO),
      nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/communities/:id/messages]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleCreate(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    const rate = await checkContentCreateRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await storage.createMessage(id, userId, parsed.data.content);
    if (result.status === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result.status === "forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const dto = toMessageDTO(result.message);

    // Post-commit, best-effort: a broadcast failure must never fail the send
    // (persistence is the source of truth; the client also loads history over
    // HTTP). Never log the payload — broadcastNewMessage throws with a status
    // code only.
    Promise.resolve()
      .then(() => broadcastNewMessage(id, dto))
      .catch((err) => {
        // Code only — never the payload (carries message content).
        console.error("[chat broadcast]", { code: safeErrorCode(err) });
      });

    return res.status(201).json(dto);
  } catch (err) {
    console.error("[POST /api/v1/communities/:id/messages]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleDelete(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const result = await storage.softDeleteMessage(
      id,
      req.user!.id,
      req.ip ?? null,
    );
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/v1/messages/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleReport(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    const rate = await checkReportRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = messageReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    // Only a visible message is reportable: existing, in a live community, not
    // deleted, sender not block-hidden (getMessage handles all but deleted), and
    // the caller must be a member. Any failure → 404 (don't leak existence).
    const message = await storage.getMessage(id, userId);
    if (!message || message.deletedAt) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!(await storage.isCommunityMember(message.communityId, userId))) {
      return res.status(404).json({ error: "Not found" });
    }

    await storage.submitReport(
      userId,
      { resourceType: "message", resourceId: id, reason: parsed.data.reason },
      req.ip ?? null,
    );
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/messages/:id/report]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
