import { createHash, randomBytes } from "node:crypto";
import prisma from "./db.js";
import { MetaClient, PageClient, type MetaPage, type MetaPermission } from "./meta-client.js";
import { decryptToken, encryptToken } from "./token-cipher.js";
import type { Actor } from "./auth.js";
import type { ReturnTypeMetaConfig } from "./types.js";

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "pages_manage_engagement",
  "pages_manage_metadata",
] as const;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const stableHash = (value: unknown) => hash(JSON.stringify(value));

function capabilities(page: MetaPage, scopes: Set<string>) {
  const tasks = new Set(page.tasks || []);
  return {
    canRead: scopes.has("pages_read_engagement"),
    canPublish: scopes.has("pages_manage_posts") && (tasks.has("MANAGE") || tasks.has("CREATE_CONTENT")),
    canManageComments: scopes.has("pages_manage_engagement") && (tasks.has("MANAGE") || tasks.has("MODERATE")),
  };
}

async function saveAuthorization(input: { actor: Actor; identity: { id: string; name?: string }; token: string; expiresIn?: number; permissions: MetaPermission[]; pages: MetaPage[] }) {
  const now = new Date();
  const granted = new Set(input.permissions.filter((item) => item.status === "granted").map((item) => item.permission));
  await prisma.$transaction(async (tx: any) => {
    await tx.metaAuthorization.upsert({
      where: { userId: input.actor.id },
      update: { facebookUserId: input.identity.id, facebookUserName: input.identity.name || null, userTokenCiphertext: encryptToken(input.token), grantedScopes: [...granted].sort().join(" "), status: "ACTIVE", tokenExpiresAt: input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null, authorizedAt: now, lastVerifiedAt: now },
      create: { userId: input.actor.id, facebookUserId: input.identity.id, facebookUserName: input.identity.name || null, userTokenCiphertext: encryptToken(input.token), grantedScopes: [...granted].sort().join(" "), status: "ACTIVE", tokenExpiresAt: input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null, lastVerifiedAt: now },
    });
    await tx.authorizedPage.updateMany({ where: { userId: input.actor.id }, data: { status: "REVOKED", lastVerifiedAt: now } });
    for (const page of input.pages) {
      if (!page.id || !page.name || !page.access_token) continue;
      const data = { pageName: page.name, category: page.category || null, tasks: JSON.stringify(page.tasks || []), pageTokenCiphertext: encryptToken(page.access_token), ...capabilities(page, granted), status: "ACTIVE", lastVerifiedAt: now };
      await tx.authorizedPage.upsert({ where: { userId_pageId: { userId: input.actor.id, pageId: page.id } }, update: data, create: { userId: input.actor.id, pageId: page.id, ...data } });
    }
  });
}

export async function createAuthorizationUrl(actor: Actor, config: ReturnTypeMetaConfig) {
  const state = randomBytes(32).toString("base64url");
  await prisma.metaOAuthState.create({ data: { stateHash: hash(state), userId: actor.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
  const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("state", state);
  if (config.configId) url.searchParams.set("config_id", config.configId);
  return url.toString();
}

export async function completeAuthorization(code: string, state: string, config: ReturnTypeMetaConfig) {
  const stored = await prisma.metaOAuthState.findUnique({ where: { stateHash: hash(state) } });
  if (!stored || stored.consumedAt || stored.expiresAt <= new Date()) throw new Error("META_STATE_INVALID");
  const consumed = await prisma.metaOAuthState.updateMany({ where: { id: stored.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw new Error("META_STATE_INVALID");
  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || user.status !== "ACTIVE") throw new Error("USER_INACTIVE");
  const client = new MetaClient(config);
  const token = await client.exchangeCode(code);
  const [identity, permissions, pages] = await Promise.all([client.identity(token.access_token), client.permissions(token.access_token), client.pages(token.access_token)]);
  await saveAuthorization({ actor: { id: user.id, email: user.email }, identity, token: token.access_token, expiresIn: token.expires_in, permissions, pages });
  return pages.length;
}

export async function status(userId: number) {
  const [authorization, pages] = await Promise.all([
    prisma.metaAuthorization.findUnique({ where: { userId } }),
    prisma.authorizedPage.findMany({ where: { userId, status: "ACTIVE" }, orderBy: { pageName: "asc" } }),
  ]);
  return {
    connected: authorization?.status === "ACTIVE",
    facebookUserName: authorization?.facebookUserName || null,
    grantedScopes: authorization?.grantedScopes.split(/\s+/).filter(Boolean) || [],
    tokenExpiresAt: authorization?.tokenExpiresAt || null,
    lastVerifiedAt: authorization?.lastVerifiedAt || null,
    pages: pages.map(({ pageTokenCiphertext: _token, tasks, ...page }: any) => ({ ...page, tasks: JSON.parse(tasks) as string[] })),
  };
}

export async function verifyAuthorization(actor: Actor, config: ReturnTypeMetaConfig) {
  const auth = await prisma.metaAuthorization.findUnique({ where: { userId: actor.id } });
  if (!auth || auth.status !== "ACTIVE") throw new Error("META_NOT_CONNECTED");
  const client = new MetaClient(config);
  const token = decryptToken(auth.userTokenCiphertext);
  const [identity, permissions, pages] = await Promise.all([client.identity(token), client.permissions(token), client.pages(token)]);
  if (identity.id !== auth.facebookUserId) throw new Error("META_IDENTITY_CHANGED");
  await saveAuthorization({ actor, identity, token, permissions, pages });
  return status(actor.id);
}

export async function disconnect(userId: number) {
  await prisma.$transaction([
    prisma.metaAuthorization.updateMany({ where: { userId }, data: { status: "REVOKED", userTokenCiphertext: "revoked" } }),
    prisma.authorizedPage.updateMany({ where: { userId }, data: { status: "REVOKED", pageTokenCiphertext: "revoked" } }),
  ]);
}

async function authorizedPage(userId: number, pageId: string, capability: "canRead" | "canPublish") {
  const page = await prisma.authorizedPage.findUnique({ where: { userId_pageId: { userId, pageId } } });
  if (!page || page.status !== "ACTIVE" || !page[capability]) throw new Error("PAGE_NOT_AUTHORIZED");
  return { page, client: new PageClient(decryptToken(page.pageTokenCiphertext), process.env.META_GRAPH_API_VERSION || "v23.0") };
}

export async function listPosts(userId: number, pageId: string, after?: string) {
  const { client } = await authorizedPage(userId, pageId, "canRead");
  return client.posts(pageId, 20, after);
}

export async function publishPost(input: { userId: number; pageId: string; message: string; imageUrl?: string; imageDataUrl?: string; confirmationText: string; idempotencyKey: string }) {
  if (input.confirmationText !== `PUBLISH:${input.pageId}`) throw new Error("CONFIRMATION_REQUIRED");
  if (!input.message.trim() || input.message.length > 63206) throw new Error("MESSAGE_INVALID");
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_INVALID");
  if (input.imageUrl && input.imageDataUrl) throw new Error("IMAGE_SOURCE_CONFLICT");
  if (input.imageUrl) {
    const url = new URL(input.imageUrl);
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("IMAGE_URL_INVALID");
  }
  let generatedImage:
    | { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" }
    | undefined;
  if (input.imageDataUrl) {
    if (input.imageDataUrl.length > 3_600_000) throw new Error("IMAGE_DATA_TOO_LARGE");
    const match = input.imageDataUrl.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) throw new Error("IMAGE_DATA_INVALID");
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    if (!bytes.length || bytes.byteLength > 2_700_000) throw new Error("IMAGE_DATA_TOO_LARGE");
    generatedImage = {
      bytes,
      mediaType: match[1] as "image/jpeg" | "image/png",
    };
  }
  const action = "PUBLISH_POST";
  const requestHash = stableHash({
    pageId: input.pageId,
    message: input.message,
    imageUrl: input.imageUrl || null,
    imageDataHash: input.imageDataUrl ? hash(input.imageDataUrl) : null,
  });
  try {
    await prisma.actionReceipt.create({ data: { userId: input.userId, action, key: input.idempotencyKey, requestHash, resultJson: { state: "PENDING" } } });
  } catch {
    const previous = await prisma.actionReceipt.findUnique({ where: { userId_action_key: { userId: input.userId, action, key: input.idempotencyKey } } });
    if (!previous || previous.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
    if ((previous.resultJson as any)?.state === "PENDING") throw new Error("IDEMPOTENCY_IN_PROGRESS");
    if ((previous.resultJson as any)?.state === "FAILED") throw new Error("IDEMPOTENCY_PREVIOUS_FAILED");
    return previous.resultJson;
  }
  const { client } = await authorizedPage(input.userId, input.pageId, "canPublish");
  try {
    const response = generatedImage
      ? await client.publishPhotoData(
          input.pageId,
          input.message,
          generatedImage.bytes,
          generatedImage.mediaType,
        )
      : input.imageUrl
        ? await client.publishPhoto(input.pageId, input.message, input.imageUrl)
        : await client.publishText(input.pageId, input.message);
    const postId = ("post_id" in response ? response.post_id : undefined) || response.id;
    if (!postId) throw new Error("META_POST_ID_MISSING");
    const result = { success: true, pageId: input.pageId, postId };
    await prisma.$transaction([
      prisma.actionReceipt.update({ where: { userId_action_key: { userId: input.userId, action, key: input.idempotencyKey } }, data: { resultJson: result } }),
      prisma.actionLog.create({ data: { userId: input.userId, action, pageId: input.pageId, status: "SUCCESS", requestJson: { messageLength: input.message.length, imageSource: generatedImage ? "AI_GENERATED" : input.imageUrl ? new URL(input.imageUrl).hostname : null }, resultJson: result } }),
    ]);
    return result;
  } catch (error) {
    await prisma.$transaction([
      prisma.actionReceipt.update({ where: { userId_action_key: { userId: input.userId, action, key: input.idempotencyKey } }, data: { resultJson: { state: "FAILED" } } }),
      prisma.actionLog.create({ data: { userId: input.userId, action, pageId: input.pageId, status: "FAILED", requestJson: { messageLength: input.message.length }, errorMessage: error instanceof Error ? error.message : "UNKNOWN" } }),
    ]);
    throw error;
  }
}
