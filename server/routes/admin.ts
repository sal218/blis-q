import type { Express } from "express";
import { isAuthenticated, requireAdmin } from "../auth";

/**
 * Admin / moderation dashboard endpoints (consumed by the Vite web app in
 * admin/). EVERY route is gated by isAuthenticated THEN requireAdmin — the
 * order matters, requireAdmin reads req.user populated by isAuthenticated and
 * returns 403 for non-admins. Admin mutations must write an audit_log entry.
 *
 * Routes are added per dashboard feature: reports queue + resolution, safe
 * places CRUD, events management, user moderation (ban/mute), and ad campaigns.
 */
export function registerAdminRoutes(app: Express): void {
  // Lightweight identity check — lets the dashboard confirm the signed-in user
  // is a platform admin before rendering. Also exercises the middleware chain.
  app.get(
    "/api/admin/me",
    isAuthenticated,
    requireAdmin,
    async (req, res) => {
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
    },
  );
}
