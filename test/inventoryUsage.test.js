const test = require("node:test");
const assert = require("node:assert/strict");
const { buildInventoryUsageFromOrders } = require("../buildInventoryUsage");

test("usage is generated from one specific batch's orders", () => {
  const usage = buildInventoryUsageFromOrders([{ exactPackingGroup: "8x8x4", products: [
    { productName: "2x Chaos Rising English Booster Pack", physicalQty: 6 }
  ] }]);
  assert.deepEqual(usage, { "Chaos Rising Packs": 6, "8x8x4 Boxes": 1 });
});

test("non-box packing groups do not consume a shipping box", () => {
  const usage = buildInventoryUsageFromOrders([{ exactPackingGroup: "Packs Only", products: [
    { productName: "Loose Pack", physicalQty: 2 }
  ] }]);
  assert.deepEqual(usage, { "Loose Pack": 2 });
});

test("temporary booster-box rule consumes one 7x5x5 supply", () => {
  const usage = buildInventoryUsageFromOrders([{ exactPackingGroup: "7x5x5", products: [
    { productName: "S&V Chasing Glory Together Booster Box (Chinese)", physicalQty: 1 }
  ] }]);
  assert.deepEqual(usage, {
    "S&V Chasing Glory Together Booster Box (Chinese)": 1,
    "7x5x5 Boxes": 1
  });
});

test("approved product aliases combine into canonical inventory items", () => {
  const usage = buildInventoryUsageFromOrders([{ exactPackingGroup: "Packs Only", products: [
    { productName: "Random Booster Pack (JP/KR/CN)", physicalQty: 2 },
    { productName: "RANDOM BOOSTER PACK (JP/KR/CN)", physicalQty: 3 },
    { productName: "x1 Random Booster Pack", physicalQty: 4 },
    { productName: "Ascended Heroes - Mega Emboar ex Box", physicalQty: 1 },
    { productName: "Ascended Heroes Mega Emboar ex Box", physicalQty: 2 },
    { productName: "Lumiose City Mini Tin (Random Art)", physicalQty: 5 },
    { productName: "Lumiose City Mini Tin", physicalQty: 6 },
    { productName: "Gem 4 Booster Pack", physicalQty: 7 },
    { productName: "Gem 4 Booster Pack x1", physicalQty: 8 }
  ] }]);
  assert.deepEqual(usage, {
    "Random Booster Pack (JP/KR/CN)": 9,
    "Ascended Heroes Mega Emboar ex Box": 3,
    "Lumiose City Mini Tin": 11,
    "Gem Packs": 15
  });
});

test("inventory usage matches current shared names for Chaos Rising packs", () => {
  const usage = buildInventoryUsageFromOrders([{ products: [
    { productName: "Chaos Rising Booster Pack", physicalQty: 5 },
    { productName: "2x Chaos Rising English Booster Pack", physicalQty: 6 }
  ] }]);
  assert.deepEqual(usage, { "Chaos Rising Packs": 11 });
});

test("inventory usage removes decorative symbols from Chaos Rising pack aliases", () => {
  const usage = buildInventoryUsageFromOrders([{ exactPackingGroup: "Packs Only", products: [
    { productName: "💎💎Chaos Rising Booster Pack x1💎", physicalQty: 7 }
  ] }]);
  assert.deepEqual(usage, { "Chaos Rising Packs": 7 });
});

test("TikTok spelling variants normalize to approved canonical inventory names", () => {
  const usage = buildInventoryUsageFromOrders([{ products: [
    { productName: "First Partner - Series 3 Collection", physicalQty: 8 },
    { productName: "First Partner Illustration Collection (Series 3)", physicalQty: 19 },
    { productName: "Random Booster Pack (CN) x1", physicalQty: 30 },
    { productName: "Random Chinese Booster Pack", physicalQty: 12 },
    { productName: "Random Chinese Booster Pack x1", physicalQty: 7 },
    { productName: "x1 Random Booster Pack (CN)", physicalQty: 43 },
    { productName: "Pitch Black [Booster Pack] x1", physicalQty: 3 }
  ] }]);
  assert.deepEqual(usage, {
    "First Partner Series 3 Collection": 27,
    "Random Booster Pack (JP/KR/CN)": 92,
    "Pitch Black Booster Pack": 3
  });
});
