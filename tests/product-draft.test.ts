import assert from "node:assert/strict";
import test from "node:test";
import { extractProductFromHtml } from "../server/product-draft-service.js";

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
