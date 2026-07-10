import type { Express } from "express";
import { createServer, type Server } from "http";
import { registerAuthRoutes } from "./routes/auth";
import { registerAccountRoutes } from "./routes/account";
import { registerCommunityRoutes } from "./routes/communities";
import { registerPostRoutes } from "./routes/posts";
import { registerChatRoutes } from "./routes/chat";
import { registerEventRoutes } from "./routes/events";
import { registerSafePlaceRoutes } from "./routes/safePlaces";
import { registerResourceRoutes } from "./routes/resources";
import { registerNewsRoutes } from "./routes/news";
import { registerCrisisContactRoutes } from "./routes/crisisContacts";
import { registerSafetyRoutes } from "./routes/safety";
import { registerAdminRoutes } from "./routes/admin";

/**
 * Registers all application routes and returns the HTTP server (server/index.ts
 * calls server.listen on it). The /api/health endpoint is registered in
 * index.ts before this runs so it always responds.
 *
 * Domain route modules are mounted here as they are built — auth, account
 * (incl. GDPR deletion/export), communities, events, posts, messages, reports,
 * safe places, push tokens, and the RevenueCat webhook. isAuthenticated is
 * applied per-route, not globally (some routes are intentionally public).
 */
export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerAccountRoutes(app);
  registerCommunityRoutes(app);
  registerPostRoutes(app);
  registerChatRoutes(app);
  registerEventRoutes(app);
  registerSafePlaceRoutes(app);
  registerResourceRoutes(app);
  registerNewsRoutes(app);
  registerCrisisContactRoutes(app);
  registerSafetyRoutes(app);
  registerAdminRoutes(app);

  return createServer(app);
}
