import dotenv from "dotenv";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import { validateEnv } from "./env";

// ./auth, ./routes and ./db read env at import time, so they are imported
// DYNAMICALLY inside the bootstrap below — only after validateEnv() passes.
// The Express app is also constructed inside the bootstrap, so nothing that
// depends on configuration runs before validation (CLAUDE.md §5).

const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// CORS — production allows only the explicit allowlist (Fly.io API domain and
// the web app URL); development additionally allows localhost ports and tunnel
// domains. Unmatched origins receive no CORS headers and the browser blocks them.
function setupCors(app: express.Application) {
  const isProd = process.env.NODE_ENV === "production";

  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.WEB_APP_URL) {
      origins.add(process.env.WEB_APP_URL);
    }
    // Fly.io public app domain (e.g. https://blis-q.fly.dev). FLY_APP_NAME is
    // injected by Fly.io at runtime.
    if (process.env.FLY_APP_NAME) {
      origins.add(`https://${process.env.FLY_APP_NAME}.fly.dev`);
    }
    // Admin dashboard (Vite web app) — its deployed origin, when configured.
    if (process.env.ADMIN_APP_URL) {
      origins.add(process.env.ADMIN_APP_URL);
    }

    if (!isProd) {
      origins.add("http://localhost:8081"); // Expo web / Metro
      origins.add("http://127.0.0.1:8081");
      origins.add("http://localhost:19006"); // Expo web (legacy)
      origins.add("http://localhost:19000");
      origins.add("http://localhost:5173"); // Vite dev (admin dashboard)
    }

    const origin = req.header("origin");

    const setCorsHeaders = (allowedOrigin: string) => {
      res.header("Access-Control-Allow-Origin", allowedOrigin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    };

    let isAllowed = false;

    if (origin) {
      if (origins.has(origin)) {
        setCorsHeaders(origin);
        isAllowed = true;
      }
      // Dev-only tunnel domains (ngrok / Expo / Cloudflare quick tunnels).
      else if (
        !isProd &&
        (origin.endsWith(".ngrok.io") ||
          origin.endsWith(".ngrok-free.app") ||
          origin.endsWith(".exp.direct") ||
          origin.endsWith(".trycloudflare.com"))
      ) {
        setCorsHeaders(origin);
        isAllowed = true;
      }
    }

    if (req.method === "OPTIONS") {
      if (isAllowed) {
        return res.sendStatus(200);
      }
      // Ease local debugging; never give unmatched origins a pass in prod.
      if (!isProd && origin) {
        setCorsHeaders(origin);
        return res.sendStatus(200);
      }
      return res.sendStatus(403);
    }

    next();
  });
}

// Capture the raw request body so webhook signatures (RevenueCat) can be
// verified against the exact original bytes. express.json() re-serializes the
// body, which changes the bytes and breaks verification. See CLAUDE.md §4.
function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));
}

// Logs method, path, status, and duration for /api requests — and NOTHING
// else. Request bodies and response bodies are never logged: this is an
// Article 9 app, so even "redacted" response logging is too broad (it would
// capture display names and any future sensitive fields). See CLAUDE.md §9 and
// COMPLIANCE_AND_PRIVACY.md.
function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (!req.path.startsWith("/api")) return;
      const duration = Date.now() - start;
      log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    });
    next();
  });
}

// Resend click-tracking encodes '?' as '%3F' in redirect URLs, which makes
// Express treat the query string as part of the path and breaks route matching
// for links like /reset-password?token=… . Detect the first %3F in the raw URL
// and redirect with a real '?'. See CLAUDE.md "Resend %3F" gotcha.
function setupResendUrlFix(app: express.Application) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const match = req.url.match(/%3[Ff]/);
    if (!match) return next();
    const idx = match.index!;
    const fixed = req.url.substring(0, idx) + "?" + req.url.substring(idx + 3);
    log(
      `[URL-FIX] Resend encoding detected, redirecting: ${fixed.substring(0, 60)}…`,
    );
    return res.redirect(302, fixed);
  });
}

// HTTP security headers. CSP connectSrc lists only Blis-Q's real service
// origins (Supabase, Firebase/Google, Cloudflare R2). Do not relax. CLAUDE.md.
function setupHelmet(app: express.Application) {
  const isProd = process.env.NODE_ENV === "production";
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "https://*.firebaseapp.com",
            "https://apis.google.com",
            ...(isProd ? [] : ["'unsafe-inline'", "'unsafe-eval'"]),
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          // No bare `https:` wildcard — restrict images to known providers:
          // R2 (presigned asset URLs), Supabase, and Google account avatars
          // (Google Sign-In). Prevents arbitrary third-party image loads.
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https://*.r2.cloudflarestorage.com",
            "https://*.supabase.co",
            "https://*.googleusercontent.com",
          ],
          connectSrc: [
            "'self'",
            // Supabase API + Realtime (wss)
            "https://*.supabase.co",
            "wss://*.supabase.co",
            // Firebase / Google identity
            "https://*.googleapis.com",
            "https://*.firebaseio.com",
            "https://identitytoolkit.googleapis.com",
            // Cloudflare R2 (presigned upload/download URLs)
            "https://*.r2.cloudflarestorage.com",
            ...(isProd
              ? []
              : [
                  "ws://localhost:*",
                  "http://localhost:*",
                  "https://*.ngrok-free.app",
                ]),
          ],
          frameSrc: [
            "https://*.firebaseapp.com",
            "https://accounts.google.com",
          ],
          frameAncestors: ["'none'"], // equivalent to X-Frame-Options: DENY
        },
      },
      strictTransportSecurity: isProd
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
      xContentTypeOptions: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hidePoweredBy: true,
    }),
  );
}

// Error middleware. Must not re-throw after a response has been sent —
// re-throwing post-response crashes the Node process. Internal details are
// never sent to the client. See ENGINEERING_STANDARDS §6.
function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };
    const status = error.status || error.statusCode || 500;

    console.error(`[error] ${status} — ${error.message ?? "Unknown error"}`);

    if (!res.headersSent) {
      res.status(status).json({ error: "Internal Server Error" });
    }
  });
}

// Startup order is non-negotiable. See CLAUDE.md "Backend (server/)". Env is
// loaded and validated FIRST, then the app is constructed and env-reading
// modules (./auth, ./routes → ./db) are imported.
(async () => {
  // 1. Load .env, then validate, before constructing the app or importing any
  //    env-reading module. In production (Fly.io secrets) dotenv is a no-op.
  dotenv.config();
  validateEnv();

  // 2. Validate auth-specific config. ./auth is imported dynamically here so
  //    it (and its ./storage → ./db dependency, which builds the pool at import
  //    time) loads only AFTER validateEnv() has passed.
  const { validateAuthConfig } = await import("./auth");
  validateAuthConfig();

  // 3. Construct the app after validation. trust proxy must be set before
  //    anything reads req.ip (Fly.io reverse proxy). CLAUDE.md "Trust Proxy".
  const app = express();
  app.set("trust proxy", 1);

  // 4. CORS (before Helmet so its headers are not overwritten).
  setupCors(app);

  // 5. Compression.
  app.use(compression());

  // 6. Helmet with CSP.
  setupHelmet(app);

  // 7. Body parsing with rawBody capture (for webhook signatures).
  setupBodyParsing(app);

  // 8. Request logging (method, path, status, duration only).
  setupRequestLogging(app);

  // 9. Resend %3F URL fix.
  setupResendUrlFix(app);

  // 10. Health check — registered before route modules so it always responds.
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // 11. Application routes (dynamic import for the same reason as ./auth).
  const { registerRoutes } = await import("./routes");
  const server = await registerRoutes(app);

  // 12. Error handler (last).
  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({ port, host: "0.0.0.0" }, () => {
    log(`Blis-Q server listening on port ${port}`);
  });
})();
