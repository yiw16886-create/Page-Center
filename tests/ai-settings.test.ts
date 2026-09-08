import assert from "node:assert/strict";
import test from "node:test";
import {
  aiPreferenceData,
  validateAiModels,
  validateGatewayToken,
} from "../server/ai-settings.js";
import {
  aiEndpoint,
  normalizeAiBaseUrl,
} from "../server/ai-endpoint.js";

test("AI settings accept custom Gateway model IDs", () => {
  assert.deepEqual(
    validateAiModels(" anthropic/claude-sonnet-5 ", "openai/gpt-image-2"),
    { textModel: "anthropic/claude-sonnet-5", imageModel: "openai/gpt-image-2" },
  );
});

test("AI settings accept relay model names and reject malformed IDs", () => {
  assert.deepEqual(validateAiModels("gpt-5-mini", "flux-pro"), {
    textModel: "gpt-5-mini",
    imageModel: "flux-pro",
  });
  assert.throws(
    () => validateAiModels("/missing-name", "bfl/flux-2-pro"),
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

test("AI relay base URLs require public HTTPS-compatible syntax", () => {
  assert.equal(
    normalizeAiBaseUrl("https://relay.example.com/v1/"),
    "https://relay.example.com/v1",
  );
  assert.equal(
    aiEndpoint("https://relay.example.com/v1", "text").url,
    "https://relay.example.com/v1/chat/completions",
  );
  assert.equal(
    aiEndpoint("https://ai-gateway.vercel.sh/v1", "text").url,
    "https://ai-gateway.vercel.sh/v1/responses",
  );
  assert.throws(
    () => normalizeAiBaseUrl("http://relay.example.com/v1"),
    /AI_BASE_URL_INVALID/,
  );
  assert.throws(
    () => normalizeAiBaseUrl("https://127.0.0.1/v1"),
    /AI_BASE_URL_INVALID/,
  );
  assert.throws(
    () => normalizeAiBaseUrl("https://relay.example.com/v1/chat/completions"),
    /AI_BASE_URL_MUST_BE_BASE/,
  );
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
