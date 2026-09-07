import assert from "node:assert/strict";
import test from "node:test";
import {
  extractProductFromHtml,
  extractProductFromReader,
  resolveAiRuntime,
} from "../server/product-draft-service.js";

test("extracts product OG fields without storing a catalog", () => {
  const draft = extractProductFromHtml(
    `<!doctype html><html><head>
      <meta property="og:title" content="Garden Bird Feeder">
      <meta property="og:description" content="A quiet garden sculpture &amp; feeder.">
      <meta property="og:image" content="https://cdn.example.com/product.jpg">
      <meta property="product:price:amount" content="58.98">
      <meta property="product:price:currency" content="USD">
    </head></html>`,
    "https://shop.example.com/products/bird-feeder",
  );
  assert.equal(draft.title, "Garden Bird Feeder");
  assert.equal(draft.description, "A quiet garden sculpture & feeder.");
  assert.equal(draft.price, "USD 58.98");
  assert.deepEqual(draft.imageUrls, ["https://cdn.example.com/product.jpg"]);
});

test("falls back to Product JSON-LD and resolves relative images", () => {
  const draft = extractProductFromHtml(
    `<script type="application/ld+json">{
      "@type":"Product","name":"Tree Sculpture","description":"Outdoor decor",
      "image":["/images/tree.jpg"],"offers":{"price":"39","priceCurrency":"USD"}
    }</script>`,
    "https://shop.example.com/products/tree",
  );
  assert.equal(draft.title, "Tree Sculpture");
  assert.equal(draft.price, "USD 39");
  assert.deepEqual(draft.imageUrls, ["https://shop.example.com/images/tree.jpg"]);
});

test("uses Vercel OIDC with AI Gateway without a static provider key", () => {
  const runtime = resolveAiRuntime({
    VERCEL_OIDC_TOKEN: "short-lived-vercel-token",
    OPENAI_MODEL: "gpt-5-mini",
  } as NodeJS.ProcessEnv);
  assert.equal(runtime.gateway, true);
  assert.equal(runtime.endpoint, "https://ai-gateway.vercel.sh/v1/responses");
  assert.equal(runtime.model, "openai/gpt-5-mini");
  assert.equal(runtime.token, "short-lived-vercel-token");
});

test("keeps direct OpenAI as a local compatibility fallback", () => {
  const runtime = resolveAiRuntime({
    OPENAI_API_KEY: "local-openai-key",
    OPENAI_MODEL: "gpt-5-mini",
  } as NodeJS.ProcessEnv);
  assert.equal(runtime.gateway, false);
  assert.equal(runtime.endpoint, "https://api.openai.com/v1/responses");
  assert.equal(runtime.model, "gpt-5-mini");
});

test("an account Gateway token takes priority over deployment credentials", () => {
  const runtime = resolveAiRuntime(
    { VERCEL_OIDC_TOKEN: "deployment-token" } as NodeJS.ProcessEnv,
    "anthropic/claude-sonnet-5",
    "account-token",
  );
  assert.equal(runtime.gateway, true);
  assert.equal(runtime.token, "account-token");
  assert.equal(runtime.model, "anthropic/claude-sonnet-5");
});

test("extracts a blocked storefront through the reader compatibility payload", () => {
  const draft = extractProductFromReader(
    {
      data: {
        title: "Quiet Tree Bird Feeder",
        description: "A tree-inspired garden bird feeder &amp; sculpture.",
        content: `![Logo](https://cdn.example.com/logo.png?w=800&h=200)
![Quiet Tree Bird Feeder](https://cdn.example.com/tree.webp?w=1024&h=1024)
# Quiet Tree Bird Feeder
50% OFF$58.98 USD$117.96 USD`,
      },
    },
    "https://shop.example.com/products/tree",
  );
  assert.equal(draft.title, "Quiet Tree Bird Feeder");
  assert.equal(draft.description, "A tree-inspired garden bird feeder & sculpture.");
  assert.equal(draft.price, "$58.98 USD");
  assert.deepEqual(draft.imageUrls, ["https://cdn.example.com/tree.webp?w=1024&h=1024"]);
  assert.equal(draft.parseMode, "reader");
});
