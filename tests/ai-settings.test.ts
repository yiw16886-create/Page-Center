import assert from "node:assert/strict";
import test from "node:test";
import {
  validateAiModel,
  validateGatewayToken,
} from "../server/ai-settings.js";
import {
  aiEndpoint,
  normalizeAiBaseUrl,
} from "../server/ai-endpoint.js";

test("AI settings accept a custom text model ID", () => {
  assert.equal(
    validateAiModel(" anthropic/claude-sonnet-5 "),
    "anthropic/claude-sonnet-5",
  );
});

test("AI settings accept relay model names and reject malformed IDs", () => {
  assert.equal(validateAiModel("gpt-5-mini"), "gpt-5-mini");
  assert.throws(
    () => validateAiModel("/missing-name"),
    /AI_TEXT_MODEL_INVALID/,
  );
  assert.throws(
    () => validateAiModel("https:\/\/example.com/model"),
    /AI_TEXT_MODEL_INVALID/,
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
    aiEndpoint("https://relay.example.com/v1").url,
    "https://relay.example.com/v1/chat/completions",
  );
  assert.equal(
    aiEndpoint("https://relay.example.com/v1").fallbackUrl,
    "https://relay.example.com/v1/responses",
  );
  assert.equal(
    aiEndpoint("https://ai-gateway.vercel.sh/v1").url,
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
