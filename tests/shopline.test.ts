import assert from "node:assert/strict";
import test from "node:test";
import { scoreProducts } from "../server/shopline-service.js";

test("SHOPLINE hot score favors recent sales without storing order rows", () => {
  const [rising, flat] = scoreProducts([
    { sourceId: "rising", sales7d: 10, salesPrevious7d: 2 },
    { sourceId: "flat", sales7d: 5, salesPrevious7d: 5 },
  ]);
  assert.equal(rising.growthRate, 4);
  assert.equal(rising.hotScore, 100);
  assert.equal(flat.growthRate, 0);
  assert.equal(flat.hotScore, 35);
});

test("SHOPLINE hot score handles a new seller with no previous sales", () => {
  const [item] = scoreProducts([
    { sourceId: "new", sales7d: 3, salesPrevious7d: 0 },
  ]);
  assert.equal(item.growthRate, 1);
  assert.equal(item.hotScore, 85);
});
