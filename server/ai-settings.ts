import prisma from "./db.js";
import { decryptToken, encryptToken } from "./token-cipher.js";
import { assertPublicAiBaseUrl } from "./ai-endpoint.js";

const MODEL_ID = /^[a-z0-9][a-z0-9._:/-]{0,192}$/i;

export function validateAiModel(textModel: string) {
  const normalizedText = textModel.trim();
  if (!MODEL_ID.test(normalizedText) || normalizedText.includes("//"))
    throw new Error("AI_TEXT_MODEL_INVALID");
  return normalizedText;
}

export async function getAiSettings(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiTextModel: true,
      aiBaseUrl: true,
      aiGatewayTokenCiphertext: true,
    },
  });
  if (!user) throw new Error("USER_INACTIVE");
  return {
    aiTextModel: user.aiTextModel,
    aiBaseUrl: user.aiBaseUrl || "",
    hasToken: Boolean(user.aiGatewayTokenCiphertext),
  };
}

export async function getAiRuntimeSettings(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiTextModel: true,
      aiBaseUrl: true,
      aiGatewayTokenCiphertext: true,
    },
  });
  if (!user) throw new Error("USER_INACTIVE");
  return {
    aiTextModel: user.aiTextModel,
    aiBaseUrl: user.aiBaseUrl || undefined,
    gatewayToken: user.aiGatewayTokenCiphertext
      ? decryptToken(user.aiGatewayTokenCiphertext)
      : undefined,
  };
}

export function validateGatewayToken(token: string) {
  const value = token.trim();
  if (value.length < 12 || value.length > 4096 || /\s/.test(value))
    throw new Error("AI_GATEWAY_TOKEN_INVALID");
  return value;
}

export async function saveAiSettings(
  userId: number,
  textModel: string,
  baseUrl: string,
  token?: string,
  clearToken = false,
) {
  const data: {
    aiTextModel: string;
    aiBaseUrl: string | null;
    aiGatewayTokenCiphertext?: string | null;
  } = {
    aiTextModel: validateAiModel(textModel),
    aiBaseUrl: baseUrl.trim() ? await assertPublicAiBaseUrl(baseUrl) : null,
  };
  if (clearToken) data.aiGatewayTokenCiphertext = null;
  else if (token?.trim())
    data.aiGatewayTokenCiphertext = encryptToken(validateGatewayToken(token));
  await prisma.user.update({ where: { id: userId }, data });
  return getAiSettings(userId);
}
