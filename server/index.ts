import "dotenv/config";
import path from "node:path";
import express from "express";
import { assertProductionConfig } from "./config.js";
import { ensureAdmin } from "./auth.js";
import { createApp } from "./app.js";

assertProductionConfig();
const app = createApp();

const port = Number(process.env.PORT || 3000);
async function start() {
  await ensureAdmin();
  if (process.env.NODE_ENV === "production") {
    const dist = path.resolve("dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
  app.listen(port, () => console.log(`Meta Page Center listening on ${port}`));
}

void start().catch((error) => {
  console.error("startup_failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
