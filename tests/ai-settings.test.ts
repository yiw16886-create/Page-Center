import assert from "node:assert/strict";
import test from "node:test";
import {
  IMAGE_MODELS,
  TEXT_MODELS,
  validateAiModels,
} from "../server/ai-settings.js";

test("AI settings expose separate allowlists for copy and image models", () => {
  assert.ok(TEXT_MODELS.some(({ id }) => id === "openai/gpt-5-mini"));
  assert.ok(IMAGE_MODELS.some(({ id }) => id === "bfl/flux-2-pro"));
  assert.deepEqual(
    validateAiModels("openai/gpt-5.4", "openai/gpt-image-2"),
    { textModel: "openai/gpt-5.4", imageModel: "openai/gpt-image-2" },
  );
});

test("AI settings reject browser-supplied models outside the allowlist", () => {
  assert.throws(
    () => validateAiModels("unknown/text", "bfl/flux-2-pro"),
    /AI_TEXT_MODEL_INVALID/,
  );
  assert.throws(
    () => validateAiModels("openai/gpt-5-mini", "unknown/image"),
    /AI_IMAGE_MODEL_INVALID/,
  );
});
