import { createHash, randomBytes } from "node:crypto";
import prisma from "./db.js";

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function listPluginTokens(userId: number) {
  return prisma.pluginAccessToken.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      status: true,
      lastUsedAt: true,
      createdAt: true,
      revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPluginToken(userId: number, rawName: string) {
  const name = rawName.trim() || "私人插件";
  if (name.length > 60) throw new Error("PLUGIN_TOKEN_NAME_INVALID");
  const activeCount = await prisma.pluginAccessToken.count({
    where: { userId, status: "ACTIVE" },
  });
  if (activeCount >= 5) throw new Error("PLUGIN_TOKEN_LIMIT_REACHED");

  const token = `pcp_${randomBytes(32).toString("base64url")}`;
  const record = await prisma.pluginAccessToken.create({
    data: {
      userId,
      name,
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, 12),
    },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      status: true,
      lastUsedAt: true,
      createdAt: true,
      revokedAt: true,
    },
  });
  return { record, token };
}

export async function revokePluginToken(userId: number, id: string) {
  const result = await prisma.pluginAccessToken.updateMany({
    where: { id, userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  if (result.count !== 1) throw new Error("PLUGIN_TOKEN_NOT_FOUND");
}

export async function authenticatePluginToken(
  authorization: string | undefined,
) {
  const match = authorization?.match(/^Bearer\s+(pcp_[A-Za-z0-9_-]{40,})$/i);
  if (!match) return null;
  const record = await prisma.pluginAccessToken.findUnique({
    where: { tokenHash: hashToken(match[1]) },
    include: { user: { select: { id: true, email: true, status: true } } },
  });
  if (!record || record.status !== "ACTIVE" || record.user.status !== "ACTIVE")
    return null;
  await prisma.pluginAccessToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });
  return { id: record.user.id, email: record.user.email };
}
