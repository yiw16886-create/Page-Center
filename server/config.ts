import { createHmac } from "node:crypto";
import { z } from "zod";

const productionSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_REDIRECT_URI: z.string().url(),
  APP_ORIGIN: z.string().url(),
});

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;
  productionSchema.parse(env);
}

export function metaConfig(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.META_APP_ID?.trim();
  const clientSecret = env.META_APP_SECRET?.trim();
  const redirectUri = env.META_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new Error("META_OAUTH_NOT_CONFIGURED");
  return {
    clientId,
    clientSecret,
    redirectUri,
    configId: env.META_CONFIG_ID?.trim() || undefined,
    graphVersion: env.META_GRAPH_API_VERSION?.trim() || "v23.0",
  };
}

export function sessionSecret(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.JWT_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;

  const encryptionKey = env.TOKEN_ENCRYPTION_KEY?.trim();
  if (encryptionKey) {
    const decoded = Buffer.from(encryptionKey, "base64");
    if (decoded.length === 32) {
      return createHmac("sha256", decoded)
        .update("meta-page-center/session-signing/v1")
        .digest("base64url");
    }
  }

  if (env.NODE_ENV !== "production") return "local-development-secret-change-me-now";
  throw new Error("JWT_SECRET_INVALID");
}

export function readiness(env: NodeJS.ProcessEnv = process.env) {
  let sessionReady = false;
  try {
    sessionSecret(env);
    sessionReady = true;
  } catch {
    sessionReady = false;
  }

  const checks = [
    ["database", "数据库", env.DATABASE_URL],
    ["session", "会话签名", sessionReady ? "ok" : ""],
    ["cipher", "Token 加密", env.TOKEN_ENCRYPTION_KEY],
    ["meta-app", "Meta App", env.META_APP_ID && env.META_APP_SECRET ? "ok" : ""],
    ["callback", "OAuth 回调", env.META_REDIRECT_URI],
    ["origin", "应用域名", env.APP_ORIGIN],
  ].map(([id, label, value]) => ({ id, label, ready: Boolean(value) }));
  return { ready: checks.every((item) => item.ready), checks };
}
