const test = require("node:test");
const assert = require("node:assert/strict");
const { buildInventoryUsageFromOrders, bubbleWrapPiecesPerUnit, orderUsesBubbleMailer } = require("../buildInventoryUsage");

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
  assert.deepEqual(usage, { "Loose Pack": 2, "Bubble Mailers": 1 });
});

test("legacy 8x6x4 result consumes the replacement 6x6x6 supply", () => {
  const usage = buildInventoryUsageFromOrders([{ exactPackingGroup: "8x6x4", products: [] }]);
  assert.deepEqual(usage, { "6x6x6 Boxes": 1 });
});

test("numbered review orders deduct 7x5x5 without leaving Needs Review", () => {
  const usage = buildInventoryUsageFromOrders([{
    exactPackingGroup: "Needs Review",
    inventoryPackingGroup: "7x5x5",
    products: [{ productName: "\u0000 BOX # 167", physicalQty: 1 }]
  }]);
  assert.deepEqual(usage, { "\u0000 BOX # 167": 1, "7x5x5 Boxes": 1 });
});

test("ordinary Needs Review orders do not guess an inventory box", () => {
  const usage = buildInventoryUsageFromOrders([{ exactPackingGroup: "Needs Review", inventoryPackingGroup: null, products: [] }]);
  assert.deepEqual(usage, {});
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

test("exact long-product boxes deduct the matching 24-inch height", () => {
  const usage = buildInventoryUsageFromOrders([
    { exactPackingGroup: "24x12x4", products: [] },
    { exactPackingGroup: "24x12x6", products: [] },
    { exactPackingGroup: "24x12x6", products: [] }
  ]);
  assert.deepEqual(usage, { "24x12x4 Boxes": 1, "24x12x6 Boxes": 2 });
});

test("new exact manager box sizes deduct their matching supply rows", () => {
  const usage = buildInventoryUsageFromOrders([
    { exactPackingGroup: "11x11x3", products: [] },
    { exactPackingGroup: "12x12x12", products: [] },
    { exactPackingGroup: "16x12x12", products: [] }
  ]);
  assert.deepEqual(usage, {
    "11x11x3 Boxes": 1,
    "12x12x12 Boxes": 1,
    "16x12x12 Boxes": 1
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
    "Bubble Wrap Pieces": 11,
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
  assert.deepEqual(usage, { "Chaos Rising Packs": 7, "Bubble Mailers": 1 });
});

test("bubble wrap usage follows the approved per-item rules", () => {
  assert.equal(bubbleWrapPiecesPerUnit("Chaos Rising ETB"), 2);
  assert.equal(bubbleWrapPiecesPerUnit("Lumiose City Mini Tin"), 1);
  assert.equal(bubbleWrapPiecesPerUnit("Prismatic Super Premium Collection (SPC)"), 3);
  assert.equal(bubbleWrapPiecesPerUnit("Mega Charizard Ultra Premium Collection (UPC)"), 4);
  assert.equal(bubbleWrapPiecesPerUnit("Blooming Water 151 Premium Collection"), 4);
  assert.equal(bubbleWrapPiecesPerUnit("Chaos Rising Booster Bundle"), 0);
});

test("bubble mailers are used only for verified Packs Only orders", () => {
  const packs = [{ productName: "Chaos Rising Booster Pack", physicalQty: 2 }];
  assert.equal(orderUsesBubbleMailer({ exactPackingGroup: "Packs Only", products: packs }), true);
  assert.equal(orderUsesBubbleMailer({ exactPackingGroup: "Needs Review", products: packs }), false);
  assert.equal(orderUsesBubbleMailer({ exactPackingGroup: "Packs Only", products: [...packs, { productName: "Lumiose City Mini Tin", physicalQty: 1 }] }), false);
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
