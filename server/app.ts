import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { authenticate } from "./access.js";
import type { DB } from "./db.js";
import { HttpError, handleError } from "./http.js";
import { initPush } from "./push.js";
import { createAccountRouter } from "./routes/account.js";
import { createActivityRouter } from "./routes/activities.js";
import { createAuthRouter } from "./routes/auth.js";
import { createChildRouter } from "./routes/children.js";
import { createDataRouter } from "./routes/data.js";
import { createFamilyRouter } from "./routes/family.js";
import { createNotificationRouter } from "./routes/notifications.js";
import { createPhotoRouter } from "./routes/photos.js";

export function createApp(
  db: DB,
  options: {
    setupToken?: string;
    appUrl?: string;
    staticDir?: string;
    rateLimits?: boolean;
  } = {},
) {
  const app = express();
  const appUrl =
    options.appUrl || process.env.APP_URL || "http://localhost:5173";
  const secure = new URL(appUrl).protocol === "https:";
  const setupToken = options.setupToken ?? process.env.SETUP_TOKEN ?? "";
  const publicKey = initPush(db);
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY)
    app.set("trust proxy", Number(process.env.TRUST_PROXY));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: secure ? [] : null,
        },
      },
      strictTransportSecurity: secure ? undefined : false,
    }),
  );
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok", version: "1.0.0" });
  });
  if (options.rateLimits !== false)
    app.use(
      "/api",
      rateLimit({
        windowMs: 60000,
        limit: 240,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );
  app.use(express.json({ limit: "6mb" }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("X-TomSawyer") !== "1")
        return next(new HttpError(403, "Missing request protection header"));
      const allowed = [new URL(appUrl).origin];
      if (process.env.NODE_ENV !== "production")
        allowed.push(
          "http://127.0.0.1:5173",
          "http://localhost:5173",
          "http://127.0.0.1:3000",
        );
      if (req.get("Origin") && !allowed.includes(req.get("Origin")!))
        return next(new HttpError(403, "Request origin is not allowed"));
    }
    next();
  });
  if (options.rateLimits !== false)
    app.use(
      "/api/auth",
      rateLimit({
        windowMs: 15 * 60000,
        limit: 30,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );
  app.use("/api", createAuthRouter(db, { setupToken, secure }));
  // Every route below this boundary requires a family session.
  app.use("/api", authenticate(db));
  app.use("/api", createAccountRouter(db, secure));
  app.use("/api", createFamilyRouter(db, { appUrl, publicKey }));
  app.use("/api", createChildRouter(db));
  app.use("/api", createActivityRouter(db));
  app.use("/api", createNotificationRouter(db));
  app.use("/api", createPhotoRouter(db));
  app.use("/api", createDataRouter(db));
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "Endpoint not found.")),
  );
  const staticDir = options.staticDir || resolve("dist/client");
  if (existsSync(staticDir)) {
    app.use(
      express.static(staticDir, {
        maxAge: "1h",
        setHeaders: (res, path) => {
          if (path.endsWith("sw.js") || path.endsWith("index.html"))
            res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(staticDir, "index.html")),
    );
  }
  app.use(handleError);
  return app;
}
