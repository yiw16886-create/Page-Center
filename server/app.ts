import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import routes, { callbackRouter } from "./routes.js";
import { handleMcp, requirePluginToken } from "./mcp.js";
import oauthRouter from "./oauth.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  const standardJson = express.json({ limit: "256kb" });
  const generatedImageJson = express.json({ limit: "4mb" });
  app.use((req, res, next) => {
    // Only the confirmed Page publish route accepts an ephemeral generated image.
    if (req.method === "POST" && /^\/api\/pages\/[^/]+\/posts$/.test(req.path))
      return generatedImageJson(req, res, next);
    return standardJson(req, res, next);
  });
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "meta-page-center" }),
  );
  app.use(oauthRouter);
  app.all("/api/mcp", requirePluginToken, (req, res, next) => {
    void handleMcp(req, res).catch(next);
  });
  app.use("/api/meta", callbackRouter);
  app.use("/api", routes);
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
      console.error("request_failed", code);
      res
        .status(
          code.includes("NOT_AUTHORIZED")
            ? 403
            : code.includes("IN_PROGRESS") || code.includes("CONFLICT")
              ? 409
              : 400,
        )
        .json({ success: false, error: code });
    },
  );
  return app;
}
