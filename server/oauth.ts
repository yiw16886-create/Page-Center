import { createHash, randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { actorFromRequest } from "./auth.js";
import { sessionSecret } from "./config.js";
import prisma from "./db.js";

const router = Router();
const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;
const CODE_TTL_SECONDS = 5 * 60;
export const OAUTH_SCOPES = ["pages.read", "pages.write"] as const;

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const randomToken = (prefix: string) =>
  `${prefix}${randomBytes(32).toString("base64url")}`;

function issuer() {
  return (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
}

export function oauthResource() {
  return `${issuer()}/api/mcp`;
}

export function protectedResourceMetadataUrl() {
  return `${issuer()}/.well-known/oauth-protected-resource`;
}

export function oauthChallenge(scope = OAUTH_SCOPES.join(" ")) {
  return `Bearer resource_metadata="${protectedResourceMetadataUrl()}", scope="${scope}"`;
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function requestedScopes(value: unknown) {
  const scopes = String(value || OAUTH_SCOPES.join(" "))
    .split(/\s+/)
    .filter(Boolean);
  if (
    !scopes.length ||
    scopes.some(
      (scope) => !OAUTH_SCOPES.includes(scope as (typeof OAUTH_SCOPES)[number]),
    )
  ) {
    throw new Error("invalid_scope");
  }
  return [...new Set(scopes)].join(" ");
}

function validClientAndRedirect(clientId: string, redirectUri: string) {
  if (
    clientId === "https://chatgpt.com/oauth/client.json" &&
    redirectUri === "https://chatgpt.com/connector_platform_oauth_redirect"
  ) {
    return true;
  }
  const clientMatch = clientId.match(
    /^https:\/\/chatgpt\.com\/oauth\/([A-Za-z0-9_-]+)\/client\.json$/,
  );
  return Boolean(
    clientMatch &&
      redirectUri === `https://chatgpt.com/connector/oauth/${clientMatch[1]}`,
  );
}

type ConsentPayload = {
  type: "plugin_oauth_consent";
  userId: number;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scopes: string;
  state: string;
};

function oauthError(
  res: Response,
  status: number,
  error: string,
  description?: string,
) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({
    error,
    ...(description ? { error_description: description } : {}),
  });
}

function redirectError(
  res: Response,
  redirectUri: string,
  state: string,
  error: string,
) {
  const target = new URL(redirectUri);
  target.searchParams.set("error", error);
  target.searchParams.set("state", state);
  target.searchParams.set("iss", issuer());
  return res.redirect(302, target.toString());
}

function consentHtml(email: string, scopes: string, consentToken: string) {
  const labels = scopes
    .split(" ")
    .map((scope) =>
      scope === "pages.write"
        ? "在你明确确认后发布公共主页帖子"
        : "读取已授权公共主页及帖子",
    )
    .map((label) => `<li>${label}</li>`)
    .join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>授权私人插件</title><style>body{font-family:system-ui;background:#f5f7fb;color:#0f172a;margin:0;padding:32px}.card{max-width:520px;margin:8vh auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px;box-shadow:0 18px 50px #0f172a12}h1{font-size:24px}p,li{color:#475569;line-height:1.6}.account{background:#eff6ff;padding:10px 12px;border-radius:10px}form{display:flex;gap:10px;margin-top:24px}button{border:0;border-radius:10px;padding:11px 18px;font-weight:700;cursor:pointer}.allow{background:#1877f2;color:white}.deny{background:#e2e8f0;color:#334155}</style></head><body><main class="card"><h1>连接 Meta 公共主页（私人）</h1><p class="account">当前账号：${email.replace(/[<>&"']/g, "")}</p><p>ChatGPT 请求以下权限：</p><ul>${labels}</ul><p>发布操作仍需在对话中明确确认。你可以随时撤销连接。</p><form method="post" action="/oauth/approve"><input type="hidden" name="consent_token" value="${consentToken}"><button class="allow" name="decision" value="allow">允许连接</button><button class="deny" name="decision" value="deny">拒绝</button></form></main></body></html>`;
}

function sendProtectedResourceMetadata(res: Response) {
  return res.json({
    resource: oauthResource(),
    authorization_servers: [issuer()],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${issuer()}/#private-plugin`,
  });
}

router.get("/.well-known/oauth-protected-resource", (_req, res) => {
  return sendProtectedResourceMetadata(res);
});

router.get("/.well-known/oauth-protected-resource/api/mcp", (_req, res) => {
  return sendProtectedResourceMetadata(res);
});

router.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: issuer(),
    authorization_endpoint: `${issuer()}/oauth/authorize`,
    token_endpoint: `${issuer()}/oauth/token`,
    revocation_endpoint: `${issuer()}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: OAUTH_SCOPES,
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  });
});

router.get("/oauth/authorize", async (req, res, next) => {
  try {
    const responseType = String(req.query.response_type || "");
    const clientId = String(req.query.client_id || "");
    const redirectUri = String(req.query.redirect_uri || "");
    const codeChallenge = String(req.query.code_challenge || "");
    const challengeMethod = String(req.query.code_challenge_method || "");
    const resource = String(req.query.resource || "");
    const state = String(req.query.state || "");
    if (
      responseType !== "code" ||
      challengeMethod !== "S256" ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) ||
      resource !== oauthResource() ||
      !state ||
      state.length > 2048 ||
      !validClientAndRedirect(clientId, redirectUri)
    ) {
      return oauthError(res, 400, "invalid_request");
    }
    const scopes = requestedScopes(req.query.scope);
    const actor = await actorFromRequest(req);
    if (!actor) {
      const returnTo = req.originalUrl;
      return res.redirect(
        302,
        `/?oauth_return=${encodeURIComponent(returnTo)}`,
      );
    }
    const payload: ConsentPayload = {
      type: "plugin_oauth_consent",
      userId: actor.id,
      clientId,
      redirectUri,
      codeChallenge,
      resource,
      scopes,
      state,
    };
    const consentToken = jwt.sign(payload, sessionSecret(), {
      expiresIn: "10m",
    });
    res.setHeader("Cache-Control", "no-store");
    return res
      .type("html")
      .send(consentHtml(actor.email, scopes, consentToken));
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_scope") {
      return oauthError(res, 400, "invalid_scope");
    }
    next(error);
  }
});

router.post("/oauth/approve", async (req, res, next) => {
  try {
    const actor = await actorFromRequest(req);
    if (!actor) return oauthError(res, 401, "login_required");
    const payload = jwt.verify(
      String(req.body?.consent_token || ""),
      sessionSecret(),
    ) as ConsentPayload;
    if (
      payload.type !== "plugin_oauth_consent" ||
      payload.userId !== actor.id ||
      payload.resource !== oauthResource() ||
      !validClientAndRedirect(payload.clientId, payload.redirectUri)
    ) {
      return oauthError(res, 400, "invalid_request");
    }
    if (req.body?.decision !== "allow") {
      return redirectError(
        res,
        payload.redirectUri,
        payload.state,
        "access_denied",
      );
    }

    const code = randomToken("pcc_");
    await prisma.oAuthAuthorizationCode.create({
      data: {
        userId: actor.id,
        codeHash: hash(code),
        clientId: payload.clientId,
        redirectUri: payload.redirectUri,
        codeChallenge: payload.codeChallenge,
        resource: payload.resource,
        scopes: payload.scopes,
        expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
      },
    });
    const target = new URL(payload.redirectUri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", payload.state);
    target.searchParams.set("iss", issuer());
    return res.redirect(302, target.toString());
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return oauthError(res, 400, "invalid_request");
    }
    next(error);
  }
});

async function issueOAuthTokens(input: {
  userId: number;
  clientId: string;
  resource: string;
  scopes: string;
}) {
  const accessToken = randomToken("pco_");
  const refreshToken = randomToken("pcr_");
  const now = Date.now();
  await prisma.oAuthAccessToken.create({
    data: {
      userId: input.userId,
      clientId: input.clientId,
      accessTokenHash: hash(accessToken),
      refreshTokenHash: hash(refreshToken),
      resource: input.resource,
      scopes: input.scopes,
      expiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
      refreshExpiresAt: new Date(now + REFRESH_TTL_SECONDS * 1000),
    },
  });
  return { accessToken, refreshToken };
}

function tokenResponse(
  res: Response,
  accessToken: string,
  refreshToken: string,
  scope: string,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  return res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
  });
}

router.post("/oauth/token", async (req, res, next) => {
  try {
    const grantType = String(req.body?.grant_type || "");
    const clientId = String(req.body?.client_id || "");
    const resource = String(req.body?.resource || "");
    if (resource !== oauthResource()) {
      return oauthError(res, 400, "invalid_target");
    }

    if (grantType === "authorization_code") {
      const code = String(req.body?.code || "");
      const redirectUri = String(req.body?.redirect_uri || "");
      const verifier = String(req.body?.code_verifier || "");
      const record = await prisma.oAuthAuthorizationCode.findUnique({
        where: { codeHash: hash(code) },
        include: { user: { select: { status: true } } },
      });
      if (
        !record ||
        record.usedAt ||
        record.expiresAt <= new Date() ||
        record.user.status !== "ACTIVE" ||
        record.clientId !== clientId ||
        record.redirectUri !== redirectUri ||
        record.resource !== resource ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
        pkceChallenge(verifier) !== record.codeChallenge
      ) {
        return oauthError(res, 400, "invalid_grant");
      }
      const consumed = await prisma.oAuthAuthorizationCode.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        return oauthError(res, 400, "invalid_grant");
      }
      const issued = await issueOAuthTokens({
        userId: record.userId,
        clientId,
        resource,
        scopes: record.scopes,
      });
      return tokenResponse(
        res,
        issued.accessToken,
        issued.refreshToken,
        record.scopes,
      );
    }

    if (grantType === "refresh_token") {
      const refreshToken = String(req.body?.refresh_token || "");
      const record = await prisma.oAuthAccessToken.findUnique({
        where: { refreshTokenHash: hash(refreshToken) },
        include: { user: { select: { status: true } } },
      });
      if (
        !record ||
        record.revokedAt ||
        record.refreshExpiresAt <= new Date() ||
        record.user.status !== "ACTIVE" ||
        record.clientId !== clientId ||
        record.resource !== resource
      ) {
        return oauthError(res, 400, "invalid_grant");
      }
      const scopes: string = req.body?.scope
        ? requestedScopes(req.body.scope)
        : record.scopes;
      const originalScopes = new Set(record.scopes.split(" "));
      if (scopes.split(" ").some((scope) => !originalScopes.has(scope))) {
        return oauthError(res, 400, "invalid_scope");
      }
      const accessToken = randomToken("pco_");
      const nextRefreshToken = randomToken("pcr_");
      const now = Date.now();
      await prisma.oAuthAccessToken.update({
        where: { id: record.id },
        data: {
          accessTokenHash: hash(accessToken),
          refreshTokenHash: hash(nextRefreshToken),
          scopes,
          expiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
          refreshExpiresAt: new Date(now + REFRESH_TTL_SECONDS * 1000),
          lastUsedAt: new Date(),
        },
      });
      return tokenResponse(res, accessToken, nextRefreshToken, scopes);
    }

    return oauthError(res, 400, "unsupported_grant_type");
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_scope") {
      return oauthError(res, 400, "invalid_scope");
    }
    next(error);
  }
});

router.post("/oauth/revoke", async (req, res, next) => {
  try {
    const token = String(req.body?.token || "");
    if (token) {
      await prisma.oAuthAccessToken.updateMany({
        where: {
          OR: [
            { accessTokenHash: hash(token) },
            { refreshTokenHash: hash(token) },
          ],
        },
        data: { revokedAt: new Date() },
      });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send();
  } catch (error) {
    next(error);
  }
});

export async function authenticateOAuthAccessToken(
  authorization: string | undefined,
) {
  const match = authorization?.match(/^Bearer\s+(pco_[A-Za-z0-9_-]{40,})$/i);
  if (!match) return null;
  const record = await prisma.oAuthAccessToken.findUnique({
    where: { accessTokenHash: hash(match[1]) },
    include: { user: { select: { id: true, email: true, status: true } } },
  });
  if (
    !record ||
    record.revokedAt ||
    record.expiresAt <= new Date() ||
    record.resource !== oauthResource() ||
    record.user.status !== "ACTIVE"
  ) {
    return null;
  }
  await prisma.oAuthAccessToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });
  return {
    id: record.user.id,
    email: record.user.email,
    scopes: record.scopes.split(" "),
  };
}

export default router;
