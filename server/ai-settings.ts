import prisma from "./db.js";
import { decryptToken, encryptToken } from "./token-cipher.js";

const GATEWAY_MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._:-]{0,127}$/i;

export function validateAiModels(textModel: string, imageModel: string) {
  const normalizedText = textModel.trim();
  const normalizedImage = imageModel.trim();
  if (!GATEWAY_MODEL_ID.test(normalizedText))
    throw new Error("AI_TEXT_MODEL_INVALID");
  if (!GATEWAY_MODEL_ID.test(normalizedImage))
    throw new Error("AI_IMAGE_MODEL_INVALID");
  return { textModel: normalizedText, imageModel: normalizedImage };
}

export function aiPreferenceData(textModel: string, imageModel: string) {
  const values = validateAiModels(textModel, imageModel);
  return {
    aiTextModel: values.textModel,
    aiImageModel: values.imageModel,
  };
}

export async function getAiSettings(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiTextModel: true,
      aiImageModel: true,
      aiGatewayTokenCiphertext: true,
    },
  });
  if (!user) throw new Error("USER_INACTIVE");
  return {
    aiTextModel: user.aiTextModel,
    aiImageModel: user.aiImageModel,
    hasToken: Boolean(user.aiGatewayTokenCiphertext),
  };
}

export async function getAiRuntimeSettings(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiTextModel: true,
      aiImageModel: true,
      aiGatewayTokenCiphertext: true,
    },
  });
  if (!user) throw new Error("USER_INACTIVE");
  return {
    aiTextModel: user.aiTextModel,
    aiImageModel: user.aiImageModel,
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
  imageModel: string,
  token?: string,
  clearToken = false,
) {
  const data: {
    aiTextModel: string;
    aiImageModel: string;
    aiGatewayTokenCiphertext?: string | null;
  } = aiPreferenceData(textModel, imageModel);
  if (clearToken) data.aiGatewayTokenCiphertext = null;
  else if (token?.trim())
    data.aiGatewayTokenCiphertext = encryptToken(validateGatewayToken(token));
  await prisma.user.update({ where: { id: userId }, data });
  return getAiSettings(userId);
}
