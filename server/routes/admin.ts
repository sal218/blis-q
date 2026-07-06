import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated, requireAdmin } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type {
  CommunityRow,
  ModeratedReportRow,
  AdminUserRow,
  SafePlaceRow,
} from "../storage";
import { supabaseClient, supabaseAdmin } from "../supabase";
import {
  loginSchema,
  adminCreateCommunitySchema,
  adminUpdateCommunitySchema,
  adminReportsQuerySchema,
  adminReportResolveSchema,
  adminRemoveContentSchema,
  adminUsersQuerySchema,
  adminBanUserSchema,
  offsetPageQuerySchema,
  safePlacesListQuerySchema,
  createSafePlaceSchema,
  updateSafePlaceSchema,
  uploadUrlSchema,
  osmSearchSchema,
  bulkCreateSafePlacesSchema,
} from "../validation";
import { searchOverpass, OverpassError } from "../overpass";
import {
  createUploadUrl,
  confirmUpload,
  getDownloadUrl,
} from "../objectStorage";
import {
  checkAdminLoginRateLimit,
  checkAdminMutationRateLimit,
} from "../rateLimit";
import { isAccessibilityFeature } from "@shared/types";
import type {
  AccountProfile,
  SessionResponse,
  CommunityDTO,
  AdminReportDTO,
  AdminUserDTO,
  SafePlaceDTO,
  SafePlaceCategory,
  OffsetPage,
} from "@shared/types";

/**
 * Admin / moderation dashboard endpoints (consumed by the Vite web app in
 * admin/). EVERY protected route is gated by isAuthenticated THEN requireAdmin —
 * the order matters, requireAdmin reads req.user populated by isAuthenticated and
 * returns 403 for non-admins. Admin mutations must write an audit_log entry.
 *
 * `POST /api/admin/login` is the one UNauthenticated route here — it IS the auth
 * step. It authenticates via Supabase and gates on isAdmin server-side, so a
 * session is never handed to a non-admin.
 *
 * Routes are added per dashboard feature: reports queue + resolution, safe
 * places CRUD, events management, user moderation (ban/mute), and ad campaigns.
 */
export function registerAdminRoutes(app: Express): void {
  app.post("/api/admin/login", handleAdminLogin);

  // Lightweight identity check — lets the dashboard confirm the signed-in user
  // is a platform admin before rendering. Also exercises the middleware chain.
  app.get("/api/admin/me", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      return res.json({
        id: req.user!.id,
        displayName: req.user!.displayName,
        isAdmin: req.user!.isAdmin,
      });
    } catch (err) {
      console.error("[GET /api/admin/me]", err);
      return res.status(500).json({ error: "Failed to load admin profile" });
    }
  });

  // Communities CRUD (docs/API.md §14). Every route is isAuthenticated THEN
  // requireAdmin; mutations are rate-limited (adminMutationUser) and audited in
  // storage. Paths stay under /api/admin/* to match the scaffold; the
  // /api/v1/admin migration is tracked, not churned now (API.md §16).
  const admin = [isAuthenticated, requireAdmin];
  app.get("/api/admin/communities", ...admin, handleListCommunities);
  app.post("/api/admin/communities", ...admin, handleCreateCommunity);
  app.get("/api/admin/communities/:id", ...admin, handleGetCommunity);
  app.patch("/api/admin/communities/:id", ...admin, handleUpdateCommunity);
  app.delete("/api/admin/communities/:id", ...admin, handleDeleteCommunity);

  // Reports queue (read) + moderation actions (Sprint-4, docs/API.md §14).
  // Backend-only this slice — admin-web wiring is deferred (tracker note).
  app.get("/api/admin/reports", ...admin, handleListReports);
  app.patch("/api/admin/reports/:id", ...admin, handleResolveReport);
  app.post(
    "/api/admin/moderation/remove-content",
    ...admin,
    handleRemoveContent,
  );

  // User directory + ban/unban (P-15, docs/API.md §14). Backend-only — admin-web
  // wiring deferred. Banned users are blocked everywhere by isAuthenticated (403)
  // except GDPR export/erasure; see server/auth.ts.
  app.get("/api/admin/users", ...admin, handleListUsers);
  app.get("/api/admin/users/:id", ...admin, handleGetUser);
  app.post("/api/admin/moderation/ban", ...admin, handleBanUser);
  app.post("/api/admin/moderation/unban", ...admin, handleUnbanUser);

  // Safe places CRUD (docs/API.md §11/§14). Curated venues; mutations are
  // adminMutationUser-rate-limited + audited (IDs only) in storage. Backend-only
  // this slice — admin-web CRUD page is deferred.
  app.get("/api/admin/safe-places", ...admin, handleListSafePlaces);
  app.post("/api/admin/safe-places", ...admin, handleCreateSafePlace);
  // Presigned upload URL for a venue photo (SP-6a) → the admin PUTs the file
  // directly to R2, then passes the returned key on create/update.
  app.post(
    "/api/admin/safe-places/upload-url",
    ...admin,
    handleSafePlaceUploadUrl,
  );
  // OSM import (SP-2) — search + bulk. Registered before "/:id" isn't required
  // (these are POSTs to distinct sub-paths), but keep them grouped.
  app.post("/api/admin/safe-places/osm-search", ...admin, handleOsmSearch);
  app.post("/api/admin/safe-places/bulk", ...admin, handleBulkCreateSafePlaces);
  app.patch("/api/admin/safe-places/:id", ...admin, handleUpdateSafePlace);
  app.delete("/api/admin/safe-places/:id", ...admin, handleDeleteSafePlace);
}

async function toSafePlaceDTO(row: SafePlaceRow): Promise<SafePlaceDTO> {
  return {
    id: row.id,
    name: row.name,
    category: row.category as SafePlaceCategory,
    description: row.description,
    address: row.address,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    // Signed url for the venue photo (or null); the raw R2 key never leaves us.
    imageUrl: row.imageKey
      ? await getDownloadUrl("safeplace", row.imageKey)
      : null,
    accessibilityFeatures: [...new Set(row.accessibilityFeatures ?? [])].filter(
      isAccessibilityFeature,
    ),
    // Admin responses have no caller-save context; the field is user-only.
    saved: false,
  };
}

function toCommunityDTO(row: CommunityRow): CommunityDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    memberCount: row.memberCount,
    createdAt: row.createdAt.toISOString(),
    membership: row.callerRole ? { role: row.callerRole } : null,
  };
}

// Admin reports view — DB text columns narrowed to the DTO unions (values are
// constrained on write), plus moderation internals (reviewer/time/resolution).
// The /api/admin/* surface always returns AdminReportDTO; the public ReportDTO
// (account export) never carries these fields.
function toAdminReportDTO(row: ModeratedReportRow): AdminReportDTO {
  return {
    id: row.id,
    resourceType: row.resourceType as AdminReportDTO["resourceType"],
    resourceId: row.resourceId,
    reason: row.reason,
    status: row.status as AdminReportDTO["status"],
    createdAt: row.createdAt.toISOString(),
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    resolution: row.resolution,
  };
}

// Admin-only user view — includes email (admins manage accounts). Never used on
// a public/self surface.
function toAdminUserDTO(row: AdminUserRow): AdminUserDTO {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    isAdmin: row.isAdmin,
    isPremium: row.isPremium,
    createdAt: row.createdAt.toISOString(),
    bannedAt: row.bannedAt ? row.bannedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

// Path :id must be a UUID — reject early with 400 rather than hitting the DB.
function parseId(req: Request): string | null {
  const parsed = z.string().uuid().safeParse(req.params.id);
  return parsed.success ? parsed.data : null;
}

async function handleListCommunities(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = offsetPageQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data; // lenient: ignores extras
    const search =
      typeof req.query.search === "string" && req.query.search.trim()
        ? req.query.search.trim().slice(0, 100)
        : undefined;

    const { rows, total } = await storage.adminListCommunities({
      offset: (q.page - 1) * q.pageSize,
      limit: q.pageSize,
      search,
    });

    const body: OffsetPage<CommunityDTO> = {
      data: rows.map(toCommunityDTO),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/admin/communities]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleCreateCommunity(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = adminCreateCommunitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    // Reuse createCommunity semantics: the admin is createdById and becomes an
    // admin community member (atomic in storage).
    const community = await storage.createCommunity({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      creatorId: userId,
      ipAddress: req.ip ?? null,
    });
    return res.status(201).json(toCommunityDTO(community));
  } catch (err) {
    console.error("[POST /api/admin/communities]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGetCommunity(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const community = await storage.adminGetCommunity(id);
    if (!community) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toCommunityDTO(community));
  } catch (err) {
    console.error("[GET /api/admin/communities/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleUpdateCommunity(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const parsed = adminUpdateCommunitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const community = await storage.updateCommunity(
      id,
      parsed.data,
      userId,
      req.ip ?? null,
    );
    if (!community) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toCommunityDTO(community));
  } catch (err) {
    console.error("[PATCH /api/admin/communities/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleDeleteCommunity(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const result = await storage.softDeleteCommunity(
      id,
      userId,
      req.ip ?? null,
    );
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/admin/communities/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleListReports(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = adminReportsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data; // lenient: ignores extras

    const { rows, total } = await storage.listReports({
      offset: (q.page - 1) * q.pageSize,
      limit: q.pageSize,
      status: q.status,
    });

    const body: OffsetPage<AdminReportDTO> = {
      data: rows.map(toAdminReportDTO),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/admin/reports]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Resolve or dismiss a queued report (one-way: only pending/reviewing → 409 if
// already actioned). Audited (report.resolved / report.dismissed) in storage.
async function handleResolveReport(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const parsed = adminReportResolveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await storage.resolveReport({
      id,
      adminId: userId,
      status: parsed.data.status,
      resolution: parsed.data.resolution ?? null,
      ipAddress: req.ip ?? null,
    });
    if (result.status === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result.status === "conflict") {
      return res.status(409).json({ error: "Report already actioned" });
    }
    return res.status(200).json(toAdminReportDTO(result.report));
  } catch (err) {
    console.error("[PATCH /api/admin/reports/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Admin content removal. Posts and events this slice — the strict schema rejects
// any other resourceType with 400. The handler branches to the matching storage
// remover by resourceType. Missing/already-removed → 404. Soft-delete + scrub +
// audit (moderation.content_removed) happen in one transaction.
async function handleRemoveContent(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = adminRemoveContentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result =
      parsed.data.resourceType === "event"
        ? await storage.adminRemoveEvent(
            parsed.data.resourceId,
            userId,
            req.ip ?? null,
          )
        : await storage.adminRemovePost(
            parsed.data.resourceId,
            userId,
            req.ip ?? null,
          );
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/admin/moderation/remove-content]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleListUsers(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = adminUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data; // lenient: ignores extras

    const { rows, total } = await storage.adminListUsers({
      offset: (q.page - 1) * q.pageSize,
      limit: q.pageSize,
      search: q.search,
      status: q.status,
    });

    const body: OffsetPage<AdminUserDTO> = {
      data: rows.map(toAdminUserDTO),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/admin/users]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGetUser(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const user = await storage.adminGetUser(id);
    if (!user) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toAdminUserDTO(user));
  } catch (err) {
    console.error("[GET /api/admin/users/:id]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Ban (suspend) a user. Audited (moderation.user_banned) + profile-cache
// invalidated in storage. A missing/erased user → 404; already banned → 409.
async function handleBanUser(req: Request, res: Response): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = adminBanUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await storage.banUser(
      parsed.data.userId,
      userId,
      req.ip ?? null,
    );
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "already") {
      return res.status(409).json({ error: "User already banned" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/admin/moderation/ban]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleUnbanUser(req: Request, res: Response): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = adminBanUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await storage.unbanUser(
      parsed.data.userId,
      userId,
      req.ip ?? null,
    );
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "not_banned") {
      return res.status(409).json({ error: "User is not banned" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/admin/moderation/unban]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Best-effort revocation of the session Supabase issued before the admin gate
// rejected the user. The session is never returned to the client, so a failure
// here is not a token leak — but the security contract says we revoke it, so a
// failure must be logged (sanitized code only), not swallowed. A rejection OR a
// resolved { error } both count as failure; either way the caller still returns
// the same generic 401.
async function revokeIssuedSession(accessToken: string): Promise<void> {
  try {
    const result = await supabaseAdmin.auth.admin.signOut(
      accessToken,
      "global",
    );
    if (result?.error) {
      console.error("[POST /api/admin/login] session revocation failed", {
        code: safeErrorCode(result.error),
      });
    }
  } catch (err) {
    console.error("[POST /api/admin/login] session revocation threw", {
      code: safeErrorCode(err),
    });
  }
}

// Admin email/password sign-in. Authenticates via Supabase, then gates on a
// verified, live, isAdmin profile. Every failure mode — bad credentials,
// unverified email, missing profile, soft-deleted, or non-admin — returns the
// SAME generic 401 so the client can never learn who is an admin. If Supabase
// already issued a session before the admin gate fails, it is revoked (global
// sign-out) so it can't be used out-of-band. Never logs passwords, emails, raw
// Supabase errors, or the request body.
async function handleAdminLogin(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { email, password } = parsed.data;

    const rate = await checkAdminLoginRateLimit(req, email);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const result = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    // Bad credentials / unverified email → generic 401 (no actor known).
    if (result.error || !result.data.session || !result.data.user) {
      await storage.writeAuditLog({
        action: "admin.login_failed",
        ipAddress: req.ip ?? null,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const profile = await storage.getAccountProfile(result.data.user.id);

    // Not a live admin (missing / soft-deleted / not isAdmin) → revoke the
    // session Supabase just issued, audit with the actor id, return generic 401.
    if (!profile || profile.deletedAt || !profile.isAdmin) {
      await revokeIssuedSession(result.data.session.access_token);
      await storage.writeAuditLog({
        action: "admin.login_failed",
        actorId: result.data.user.id,
        ipAddress: req.ip ?? null,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await storage.writeAuditLog({
      action: "admin.login",
      actorId: profile.id,
      ipAddress: req.ip ?? null,
    });

    const user: AccountProfile = {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      isPremium: profile.isPremium,
      isAdmin: profile.isAdmin,
      preferredCity: profile.preferredCity,
      createdAt: profile.createdAt.toISOString(),
    };
    const body: SessionResponse = {
      user,
      session: {
        accessToken: result.data.session.access_token,
        refreshToken: result.data.session.refresh_token,
        expiresAt: new Date(
          (result.data.session.expires_at ?? 0) * 1000,
        ).toISOString(),
      },
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[POST /api/admin/login] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// ── Safe places CRUD (docs/API.md §11/§14) ──────────────────────────────────

// POST /api/admin/safe-places/upload-url — mint a presigned PUT for a venue
// photo. The admin PUTs the file straight to R2 with the declared content type,
// then passes the returned `key` on create/update (confirmed there). SW-1: the
// content type is validated + signed into the PUT.
async function handleSafePlaceUploadUrl(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }
    const parsed = uploadUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { uploadUrl, key } = await createUploadUrl(
      "safeplace",
      userId,
      parsed.data.contentType,
    );
    return res.status(200).json({ uploadUrl, key });
  } catch (err) {
    console.error("[POST /api/admin/safe-places/upload-url]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleListSafePlaces(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = safePlacesListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data;
    const { rows, total } = await storage.listSafePlaces({
      callerId: req.user!.id, // caller-save flag unused here (admin DTO → saved:false)
      page: q.page,
      pageSize: q.pageSize,
      category: q.category,
      city: q.city,
      // Free-text substring over name+city+address (already validated in the
      // shared list query schema). The admin filter box sends this so a partial
      // term like "War" matches "Warszawa"; `city` remains an exact filter.
      search: q.search,
      near: q.near,
    });
    const body: OffsetPage<SafePlaceDTO> = {
      data: await Promise.all(rows.map(toSafePlaceDTO)),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/admin/safe-places]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleCreateSafePlace(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }
    const parsed = createSafePlaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    // Verify a supplied image belongs to this admin AND is a valid image
    // (allowlisted type, ≤5 MB) before it's stored — SW-1. Do it BEFORE the DB
    // write so a bad image never half-creates the place.
    if (
      parsed.data.imageKey &&
      !(await confirmUpload("safeplace", parsed.data.imageKey, userId))
    ) {
      return res.status(400).json({ error: "Invalid image upload" });
    }
    const row = await storage.createSafePlace(
      parsed.data,
      userId,
      req.ip ?? null,
    );
    return res.status(201).json(await toSafePlaceDTO(row));
  } catch (err) {
    console.error("[POST /api/admin/safe-places]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleUpdateSafePlace(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }
    const parsed = updateSafePlaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    // A NEW image (a uuid, not null=clear / undefined=unchanged) must be
    // confirmed before it's stored — SW-1.
    if (
      typeof parsed.data.imageKey === "string" &&
      !(await confirmUpload("safeplace", parsed.data.imageKey, userId))
    ) {
      return res.status(400).json({ error: "Invalid image upload" });
    }
    const row = await storage.updateSafePlace(
      id,
      parsed.data,
      userId,
      req.ip ?? null,
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(await toSafePlaceDTO(row));
  } catch (err) {
    console.error("[PATCH /api/admin/safe-places/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleDeleteSafePlace(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }
    const result = await storage.softDeleteSafePlace(
      id,
      userId,
      req.ip ?? null,
    );
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/admin/safe-places/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// OSM search (SP-2). Queries Overpass server-side for venues in a city matching
// a category → normalized candidates the admin curates before any write. Only a
// city + category leaves us (no user PII); the Overpass raw body is never logged.
async function handleOsmSearch(req: Request, res: Response): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }
    const parsed = osmSearchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    try {
      const candidates = await searchOverpass(
        parsed.data.city,
        parsed.data.category,
      );
      return res.status(200).json({ candidates });
    } catch (err) {
      if (err instanceof OverpassError) {
        // Log only the (non-sensitive) code; never the query or the raw body.
        console.error("[POST /api/admin/safe-places/osm-search]", {
          overpass: err.message,
        });
        return res
          .status(502)
          .json({ error: "OpenStreetMap search is unavailable" });
      }
      throw err;
    }
  } catch (err) {
    console.error("[POST /api/admin/safe-places/osm-search]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Bulk-create curated safe places (SP-2). Transactional + audited (IDs-only);
// dedupes on osm_id. Returns { created, skipped }.
async function handleBulkCreateSafePlaces(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;
    const rate = await checkAdminMutationRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }
    const parsed = bulkCreateSafePlacesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const result = await storage.bulkCreateSafePlaces(
      parsed.data,
      userId,
      req.ip ?? null,
    );
    return res.status(200).json(result);
  } catch (err) {
    console.error("[POST /api/admin/safe-places/bulk]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
