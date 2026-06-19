import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated, requireAdmin } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { CommunityRow, ReportRow, ModeratedReportRow } from "../storage";
import { supabaseClient, supabaseAdmin } from "../supabase";
import {
  loginSchema,
  adminCreateCommunitySchema,
  adminUpdateCommunitySchema,
  adminReportsQuerySchema,
  adminReportResolveSchema,
  adminRemoveContentSchema,
  offsetPageQuerySchema,
} from "../validation";
import {
  checkAdminLoginRateLimit,
  checkAdminMutationRateLimit,
} from "../rateLimit";
import type {
  AccountProfile,
  SessionResponse,
  CommunityDTO,
  ReportDTO,
  AdminReportDTO,
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

// DB text columns → DTO unions. The values are constrained on write
// (createReportSchema / the "pending" default), so the narrowing is safe.
function toReportDTO(row: ReportRow): ReportDTO {
  return {
    id: row.id,
    resourceType: row.resourceType as ReportDTO["resourceType"],
    resourceId: row.resourceId,
    reason: row.reason,
    status: row.status as ReportDTO["status"],
    createdAt: row.createdAt.toISOString(),
  };
}

// Admin-only view — adds moderation internals (reviewer/time/resolution) over
// the public ReportDTO. Only the /api/admin/* moderation routes return this.
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
    const q = offsetPageQuerySchema.parse(req.query); // lenient: ignores extras
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
    const q = adminReportsQuerySchema.parse(req.query); // lenient: ignores extras

    const { rows, total } = await storage.listReports({
      offset: (q.page - 1) * q.pageSize,
      limit: q.pageSize,
      status: q.status,
    });

    const body: OffsetPage<ReportDTO> = {
      data: rows.map(toReportDTO),
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

// Admin content removal. Post-only this slice — the strict schema rejects any
// other resourceType with 400. Missing/already-removed post → 404. Soft-delete +
// scrub + audit (moderation.content_removed) happen in one transaction.
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

    const result = await storage.adminRemovePost(
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
