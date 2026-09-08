import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_TEXT_MODELS,
  validateAiModel,
  validateGatewayToken,
} from "../server/ai-settings.js";
import { aiEndpoint, normalizeAiBaseUrl } from "../server/ai-endpoint.js";

test("AI model settings are limited to the supported dropdown", () => {
  assert.deepEqual(
    AI_TEXT_MODELS.map(({ id }) => id),
    [
      "gpt-5.5",
      "gpt-5.6-luna",
      "gpt-5.6-terra",
      "gpt-5.6-sol",
      "gpt-6-astra",
    ],
  );
  assert.equal(validateAiModel(" GPT-5.6-SOL "), "gpt-5.6-sol");
  assert.throws(() => validateAiModel("custom-model"), /AI_TEXT_MODEL_INVALID/);
});

test("AI relay tokens are trimmed and validated before encryption", () => {
  assert.equal(
    validateGatewayToken("  relay-private-token-123  "),
    "relay-private-token-123",
  );
  assert.throws(() => validateGatewayToken("short"), /AI_GATEWAY_TOKEN_INVALID/);
  assert.throws(
    () => validateGatewayToken("key with spaces"),
    /AI_GATEWAY_TOKEN_INVALID/,
  );
});

test("ZenAPI-style relay URLs use chat completions with a responses fallback", () => {
  const baseUrl = normalizeAiBaseUrl("https://www.zenapi.org/v1/");
  assert.equal(baseUrl, "https://www.zenapi.org/v1");
  assert.equal(aiEndpoint(baseUrl).url, "https://www.zenapi.org/v1/chat/completions");
  assert.equal(aiEndpoint(baseUrl).fallbackUrl, "https://www.zenapi.org/v1/responses");
  assert.throws(
    () => normalizeAiBaseUrl("https://127.0.0.1/v1"),
    /AI_BASE_URL_INVALID/,
  );
});
