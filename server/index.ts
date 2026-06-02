import express from "express";
import type { Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import cron from "node-cron";
import { registerRoutes } from "./routes";
import { validateAuthConfig } from "./auth";
import { validateEnv } from "./env";
import { runDailyRecurringExpenseJob } from "./recurringCron";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";

const isWindows = process.platform === "win32";
const app = express();

// Trust the first proxy hop (Railway reverse proxy) so req.ip resolves
// to the real client IP instead of the proxy's internal address.
// This is required for rate limiting to work correctly in production.
app.set("trust proxy", 1);
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  const isProd = process.env.NODE_ENV === "production";

  app.use((req, res, next) => {
    const origins = new Set<string>();

    // Production: only explicitly configured origins are allowed.
    // WEB_APP_URL is the Expo web build URL (served by this same Express
    // server in prod, so usually same-origin — but included for safety).
    if (process.env.WEB_APP_URL) {
      origins.add(process.env.WEB_APP_URL);
    }
    // Railway public domain (set automatically by Railway in production).
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      origins.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }

    // Development only: localhost ports + legacy Replit + tunnel domains.
    // None of these are permitted in production.
    if (!isProd) {
      origins.add("http://localhost:8081");
      origins.add("http://127.0.0.1:8081");
      origins.add("http://localhost:8082");
      origins.add("http://localhost:19006");
      origins.add("http://localhost:19000");

      // Legacy Replit domains (being retired — dev only)
      if (process.env.REPLIT_DEV_DOMAIN) {
        origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
      }
      if (process.env.REPLIT_DOMAINS) {
        process.env.REPLIT_DOMAINS.split(",").forEach((d: string) => {
          origins.add(`https://${d.trim()}`);
        });
      }
    }

    const origin = req.header("origin");

    const setCorsHeaders = (allowedOrigin: string) => {
      res.header("Access-Control-Allow-Origin", allowedOrigin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, ngrok-skip-browser-warning",
      );
      res.header("Access-Control-Allow-Credentials", "true");
    };

    let isAllowed = false;

    if (origin) {
      // Exact match against the allowlist
      if (origins.has(origin)) {
        setCorsHeaders(origin);
        isAllowed = true;
      }
      // Tunnel domains — development only
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

    // Preflight OPTIONS: only respond with CORS headers for allowed origins.
    // Unmatched origins get no CORS headers — the browser will block the request.
    if (req.method === "OPTIONS") {
      if (isAllowed) {
        return res.sendStatus(200);
      }
      // In dev, allow unmatched OPTIONS to ease debugging.
      // In prod, reject — no free passes.
      if (!isProd && origin) {
        setCorsHeaders(origin);
        return res.sendStatus(200);
      }
      return res.sendStatus(403);
    }

    next();
  });
}

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

// Keys whose values must never appear in logs
const SENSITIVE_KEYS = new Set([
  "password",
  "access_token",
  "refresh_token",
  "idToken",
  "token",
  "session_secret",
  "private_key",
]);

function redactSensitive(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key)
      ? "[redacted]"
      : redactSensitive(value);
  }
  return result;
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(redactSensitive(capturedJsonResponse))}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function rewriteMetroLocalhostReferences({
  body,
  host,
  publicBase,
}: {
  body: string;
  host: string;
  publicBase: string;
}) {
  return (
    body
      // Full URLs (manifest, bundle internals, asset URLs)
      .replace(/https?:\/\/localhost:8081/g, publicBase)
      .replace(/https?:\/\/127\.0\.0\.1:8081/g, publicBase)
      // Bare quoted host strings
      .replace(/"localhost:8081"/g, `"${host}"`)
      .replace(/"127\.0\.0\.1:8081"/g, `"${host}"`)
  );
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      const manifestPath = path.resolve(
        process.cwd(),
        "static-build",
        platform,
        "manifest.json",
      );
      if (!fs.existsSync(manifestPath)) {
        // No static manifest — forward directly to Metro, preserving all
        // original headers (including expo-platform) so Metro returns the
        // correct platform-specific manifest.
        //
        // Metro running with --localhost embeds http://localhost:8081 or
        // http://127.0.0.1:8081 in bundleUrl, debuggerHost, etc. A physical
        // Android device cannot reach those addresses. Rewrite them in the
        // JSON response to the actual public server URL so Expo Go can
        // download the bundle and all assets (including icon fonts).
        const forwardedProto = req.header("x-forwarded-proto");
        const protocol = forwardedProto || req.protocol || "https";
        const forwardedHost = req.header("x-forwarded-host");
        const host = forwardedHost || req.get("host") || "";
        const publicBase = `${protocol}://${host}`;

        const proxyReq = http.get(
          {
            hostname: "127.0.0.1",
            port: 8081,
            path: req.originalUrl,
            headers: { ...req.headers, host: "127.0.0.1:8081" },
          },
          (proxyRes) => {
            // Always buffer the manifest response regardless of content-type.
            // Metro may return application/json (classic protocol),
            // multipart/mixed (expo-protocol-version: 1), or text/plain.
            // In every case we need to rewrite localhost:8081 references so
            // a physical Android device can reach them via the public domain.
            const chunks: Buffer[] = [];
            proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on("end", () => {
              const body = Buffer.concat(chunks).toString("utf-8");
              const rewritten = rewriteMetroLocalhostReferences({
                body,
                host,
                publicBase,
              });
              const responseHeaders: Record<
                string,
                string | string[] | undefined
              > = { ...proxyRes.headers };
              delete responseHeaders["transfer-encoding"];
              responseHeaders["content-length"] =
                Buffer.byteLength(rewritten).toString();
              res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
              res.end(rewritten);
            });
          },
        );
        proxyReq.on("error", () => {
          res.status(503).json({
            error: "Metro dev server unavailable — run npm run expo:dev first.",
          });
        });
        return;
      }
      return serveExpoManifest(platform, res);
    }

    // Skip the QR landing page if there's an invite query param
    // This allows the invite flow to go directly to the React app
    if (req.query.invite) {
      log(`[INVITE] Skipping landing page, serving React app with invite code`);
      return next();
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  // In dev mode, Metro serves node_module assets (fonts, icons) at
  // /assets?unstable_path=... Express's static handler below intercepts
  // that same path and issues a 301 redirect, so the font files never
  // reach the device. This proxy must come BEFORE the static handler.
  app.use("/assets", (req: Request, res: Response, next: NextFunction) => {
    if (Object.keys(req.query).length === 0) return next();
    const metroUrl = `http://127.0.0.1:8081${req.originalUrl}`;
    http
      .get(metroUrl, (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      })
      .on("error", () => next());
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  // Dev fallback: when no static web build exists, proxy to Metro bundler
  // so that /?invite=code (and bundle/asset requests) resolve instead of 404-ing
  const staticIndex = path.resolve(process.cwd(), "static-build", "index.html");
  if (!fs.existsSync(staticIndex)) {
    log("No static-build/index.html — enabling Metro dev proxy (port 8081)");
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        return next();
      }

      if (
        req.path.startsWith("/objects/") ||
        req.path.startsWith("/download/")
      ) {
        return next();
      }

      // Serve server-rendered pages directly — don't proxy them to Metro.
      // The dedicated Express route handlers registered earlier *should* catch
      // these, but on Replit the dev-domain proxy can re-order or replay
      // requests so that the Metro proxy runs instead. This safeguard ensures
      // the reset-password page is never forwarded to Metro.
      if (req.path === "/auth/reset-password") {
        log("[RESET-PAGE] Serving via Metro-proxy safeguard");
        try {
          const tpl = fs
            .readFileSync(
              path.resolve(
                process.cwd(),
                "server",
                "templates",
                "reset-password.html",
              ),
              "utf-8",
            )
            .replace("__SUPABASE_URL__", process.env.SUPABASE_URL ?? "")
            .replace(
              "__SUPABASE_ANON_KEY__",
              process.env.SUPABASE_ANON_KEY ?? "",
            );
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.send(tpl);
        } catch (err) {
          log("[RESET-PAGE] Template read error:", err);
          return res.status(500).send("Server error. Please try again later.");
        }
      }

      const metroUrl = `http://127.0.0.1:8081${req.originalUrl}`;
      const forwardedProto = req.header("x-forwarded-proto");
      const protocol = forwardedProto || req.protocol || "https";
      const forwardedHost = req.header("x-forwarded-host");
      const host = forwardedHost || req.get("host") || "";
      const publicBase = `${protocol}://${host}`;
      const shouldRewriteBundle = req.path.endsWith(".bundle");

      http
        .get(metroUrl, (proxyRes) => {
          if (!shouldRewriteBundle) {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
            return;
          }

          const chunks: Buffer[] = [];
          proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf-8");
            const rewritten = rewriteMetroLocalhostReferences({
              body,
              host,
              publicBase,
            });
            const responseHeaders: Record<
              string,
              string | string[] | undefined
            > = { ...proxyRes.headers };
            delete responseHeaders["transfer-encoding"];
            responseHeaders["content-length"] =
              Buffer.byteLength(rewritten).toString();
            res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
            res.end(rewritten);
          });
        })
        .on("error", () => next());
    });
  }

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error(`[error] ${status} — ${message}`);

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });
}

(async () => {
  // Validate all required env vars before anything else runs.
  // Exits with a clear message if any are missing or malformed.
  validateEnv();

  // Fail fast if required auth environment variables are missing
  validateAuthConfig();

  setupCors(app);

  app.use(compression());

  // HTTP security headers — applied after CORS so CORS headers are not
  // overwritten, but before any routes so every response is covered.
  const isProd = process.env.NODE_ENV === "production";
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            // Firebase SDK (auth, analytics)
            "https://*.firebaseapp.com",
            "https://*.firebase.com",
            "https://apis.google.com",
            // Allow inline scripts only in dev (Expo web HMR)
            ...(isProd ? [] : ["'unsafe-inline'", "'unsafe-eval'"]),
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'", // Expo web inlines styles
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: [
            "'self'",
            // Supabase API
            "https://*.supabase.co",
            // Firebase / Google APIs
            "https://*.googleapis.com",
            "https://*.firebaseio.com",
            "https://*.firebase.com",
            "https://identitytoolkit.googleapis.com",
            // Exchange rate API
            "https://v6.exchangerate-api.com",
            // Dev: Metro bundler + ngrok tunnels
            ...(isProd
              ? []
              : [
                  "ws://localhost:*",
                  "http://localhost:*",
                  "https://*.ngrok-free.app",
                ]),
          ],
          frameSrc: [
            // Firebase auth popups
            "https://*.firebaseapp.com",
            "https://accounts.google.com",
          ],
          frameAncestors: ["'none'"], // equivalent to X-Frame-Options: DENY
        },
      },
      // HSTS: tell browsers to use HTTPS for 1 year (production only)
      strictTransportSecurity: isProd
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
      // Prevent MIME sniffing
      xContentTypeOptions: true,
      // Don't send Referrer header to cross-origin destinations
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      // Remove X-Powered-By: Express header
      hidePoweredBy: true,
    }),
  );

  setupBodyParsing(app);
  setupRequestLogging(app);

  // Resend click-tracking encodes '?' as '%3F' in redirect URLs.
  // This causes Express to treat the query string as part of the path,
  // breaking route matching for /invite?code=... and /reset-password?token=...
  // Fix: detect the first %3F in the raw URL and redirect with a real '?'.
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

  // Healthcheck endpoint - responds before any other middleware can fail
  // Use this to verify the tunnel is working: curl https://your-ngrok-url/health
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Invite landing page - must be registered BEFORE static middleware
  // so it takes precedence over Expo's catch-all index.html
  app.get("/invite", (req, res) => {
    const code = String(req.query.code || "").trim();
    const expoUrl = process.env.EXPO_GO_URL || "";
    const webUrl = process.env.WEB_APP_URL || "";

    if (!code) {
      return res.status(400).send("Missing invite code.");
    }

    // Build URLs - pass invite code as query param for cross-domain localStorage issue
    const continueWeb = webUrl
      ? `${webUrl}/?invite=${encodeURIComponent(code)}`
      : `/?invite=${encodeURIComponent(code)}`;
    const openExpo = expoUrl
      ? `${expoUrl}?invite=${encodeURIComponent(code)}`
      : "";

    log(`[INVITE] Landing page hit - code: ${code.slice(0, 8)}...`);
    log(`[INVITE] Will redirect to: ${continueWeb}`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`
  <!doctype html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Even Tab Invite</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto; padding:24px; max-width:420px; margin:0 auto; text-align:center;}
      .btn{display:block; padding:14px 16px; margin:12px 0; border-radius:12px; text-align:center; text-decoration:none; font-weight:600;}
      .primary{background:#10B981; color:#fff;}
      .secondary{background:#f3f3f3; color:#111;}
      .muted{color:#666; font-size:14px; margin-top:14px;}
      .spinner{border:3px solid #f3f3f3; border-top:3px solid #10B981; border-radius:50%; width:32px; height:32px; animation:spin 1s linear infinite; margin:20px auto;}
      @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
      .redirect-msg{color:#666; margin-top:10px;}
      #mobile-content{display:none;}
    </style>
  </head>
  <body>
    <div id="desktop-content">
      <h2>You've been invited!</h2>
      <div class="spinner"></div>
      <p class="redirect-msg">Redirecting to Even Tab...</p>
    </div>

    <div id="mobile-content">
      <h2>You've been invited!</h2>
      <p>Open Even Tab to accept the invite.</p>
      ${openExpo ? `<a class="btn primary" href="${openExpo}">Open in Expo Go</a>` : ""}
      <a class="btn ${openExpo ? "secondary" : "primary"}" href="${continueWeb}">Continue on Web</a>
      <p class="muted">After signing in, the invite will be applied automatically.</p>
    </div>

    <script>
      (function() {
        var code = ${JSON.stringify(code)};
        var webUrl = ${JSON.stringify(continueWeb)};

        // Store invite code locally (works if same domain)
        try { localStorage.setItem("pending_invite_code", code); } catch(e) {}

        // Detect mobile
        var ua = navigator.userAgent;
        var isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);

        if (isMobile) {
          // Show mobile UI with buttons
          document.getElementById("desktop-content").style.display = "none";
          document.getElementById("mobile-content").style.display = "block";
        } else {
          // Desktop: auto-redirect to web app
          setTimeout(function() {
            window.location.href = webUrl;
          }, 800);
        }
      })();
    </script>
  </body>
  </html>
    `);
  });

  // Password Reset Page — Supabase sends a magic link that redirects here.
  // Supabase appends tokens as a hash fragment (not query params), so no
  // server-side token check is needed; the page's JS reads window.location.hash.
  // Must be registered BEFORE static middleware.
  app.get("/auth/reset-password", (req, res) => {
    log("[RESET-PAGE] Serving Supabase reset page");
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "reset-password.html",
    );

    try {
      const template = fs
        .readFileSync(templatePath, "utf-8")
        .replace("__SUPABASE_URL__", process.env.SUPABASE_URL ?? "")
        .replace("__SUPABASE_ANON_KEY__", process.env.SUPABASE_ANON_KEY ?? "");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // Override CSP for this standalone page only.
      // Additions vs global policy: 'unsafe-inline' for scripts (inline logic),
      // cdn.jsdelivr.net for the Supabase JS SDK loaded from jsDelivr.
      // All other global protections are preserved explicitly.
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
          "connect-src 'self' https://*.supabase.co",
          "frame-src 'none'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      );
      res.send(template);
    } catch (error) {
      log("[RESET-PAGE] Template read error:", error);
      res.status(500).send("Server error. Please try again later.");
    }
  });

  app.get("/auth/confirm", (req, res) => {
    log("[CONFIRM-PAGE] Serving email confirmation page");
    const templatePath = path.resolve(
      process.cwd(),
      "server",
      "templates",
      "confirm.html",
    );

    try {
      const template = fs.readFileSync(templatePath, "utf-8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // Override CSP for this standalone page only.
      // Addition vs global policy: 'unsafe-inline' for scripts (inline logic).
      // No external script origins needed — confirm.html loads no third-party JS.
      // No connect-src relaxation — this page makes no API calls.
      // All other global protections are preserved explicitly.
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
          "connect-src 'none'",
          "frame-src 'none'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'none'",
        ].join("; "),
      );
      res.send(template);
    } catch (error) {
      log("[CONFIRM-PAGE] Template read error:", error);
      res.status(500).send("Server error. Please try again later.");
    }
  });

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      // Only use reusePort if we are NOT on Windows (i.e., on Replit/Linux)
      ...(isWindows ? {} : { reusePort: true }),
    },
    () => {
      log(`express server serving on port ${port}`);

      // Daily recurring expense job — runs at 09:00 UTC (adjust as needed).
      // Inserts due recurring expenses for all users and sends push notifications.
      // The catch-up insertion in GET /api/personal/settings handles users who
      // had the app closed; notifications are only sent here (never on app open).
      cron.schedule("0 9 * * *", () => {
        log("[RecurringCron] Starting daily recurring expense job");
        runDailyRecurringExpenseJob().catch((err) =>
          console.error("[RecurringCron] Job failed:", err),
        );
      });
      log("[RecurringCron] Scheduled daily job at 09:00 UTC");
    },
  );
})();
