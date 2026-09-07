import assert from "node:assert/strict";
import test from "node:test";
import {
  aiPreferenceData,
  validateAiModels,
  validateGatewayToken,
} from "../server/ai-settings.js";

test("AI settings accept custom Gateway model IDs", () => {
  assert.deepEqual(
    validateAiModels(" anthropic/claude-sonnet-5 ", "openai/gpt-image-2"),
    { textModel: "anthropic/claude-sonnet-5", imageModel: "openai/gpt-image-2" },
  );
});

test("AI settings reject malformed Gateway model IDs", () => {
  assert.throws(
    () => validateAiModels("missing-provider", "bfl/flux-2-pro"),
    /AI_TEXT_MODEL_INVALID/,
  );
  assert.throws(
    () => validateAiModels("openai/gpt-5-mini", "https:\/\/example.com/model"),
    /AI_IMAGE_MODEL_INVALID/,
  );
});

test("AI Gateway tokens are validated without assuming a provider prefix", () => {
  assert.equal(validateGatewayToken("  custom-private-token-123  "), "custom-private-token-123");
  assert.throws(() => validateGatewayToken("short"), /AI_GATEWAY_TOKEN_INVALID/);
  assert.throws(() => validateGatewayToken("token with spaces"), /AI_GATEWAY_TOKEN_INVALID/);
});

test("AI settings map API names to the Prisma user fields", () => {
  assert.deepEqual(
    aiPreferenceData("openai/gpt-5-mini", "bfl/flux-2-pro"),
    {
      aiTextModel: "openai/gpt-5-mini",
      aiImageModel: "bfl/flux-2-pro",
    },
  );
});
