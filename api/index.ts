import "dotenv/config";
import type { Request, Response } from "express";
import { createApp } from "../server/app.js";
import { ensureAdmin } from "../server/auth.js";
import { assertProductionConfig } from "../server/config.js";

assertProductionConfig();
const app = createApp();
const bootstrap = ensureAdmin();

export default async function handler(req: Request, res: Response) {
  await bootstrap;
  return app(req, res);
}
