import "dotenv/config";
import type { Request, Response } from "express";
import { createApp } from "../server/app.js";
import { ensureAdmin } from "../server/auth.js";

const app = createApp();
let bootstrap: Promise<void> | null = null;

export default async function handler(req: Request, res: Response) {
  const pathname = new URL(req.url || "/", "https://page-center.local").pathname;
  if (pathname !== "/api/health" && pathname !== "/api/readiness") {
    bootstrap ||= ensureAdmin();
    try {
      await bootstrap;
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        message: "admin_bootstrap_failed",
        error: error instanceof Error ? error.message : String(error),
      }));
      return res.status(503).json({ success: false, error: "服务尚未完成数据库初始化", code: "SERVICE_NOT_READY" });
    }
  }
  return app(req, res);
}
