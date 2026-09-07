import prisma from "./db.js";

export const TEXT_MODELS = [
  { id: "openai/gpt-5-mini", label: "GPT-5 mini（快速）" },
  { id: "openai/gpt-5.4", label: "GPT-5.4（高质量）" },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
] as const;

export const IMAGE_MODELS = [
  { id: "bfl/flux-2-pro", label: "Flux 2 Pro（推荐）" },
  { id: "openai/gpt-image-2", label: "GPT Image 2" },
  { id: "openai/gpt-image-1-mini", label: "GPT Image 1 Mini（经济）" },
] as const;

const textIds = new Set<string>(TEXT_MODELS.map(({ id }) => id));
const imageIds = new Set<string>(IMAGE_MODELS.map(({ id }) => id));

export function validateAiModels(textModel: string, imageModel: string) {
  if (!textIds.has(textModel)) throw new Error("AI_TEXT_MODEL_INVALID");
  if (!imageIds.has(imageModel)) throw new Error("AI_IMAGE_MODEL_INVALID");
  return { textModel, imageModel };
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
    select: { aiTextModel: true, aiImageModel: true },
  });
  if (!user) throw new Error("USER_INACTIVE");
  return {
    ...user,
    textModels: TEXT_MODELS,
    imageModels: IMAGE_MODELS,
  };
}

export async function saveAiSettings(
  userId: number,
  textModel: string,
  imageModel: string,
) {
  const data = aiPreferenceData(textModel, imageModel);
  await prisma.user.update({ where: { id: userId }, data });
  return getAiSettings(userId);
}
