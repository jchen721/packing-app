const test = require("node:test");
const assert = require("node:assert/strict");
const { inventoryCategory, summarizeInventory } = require("../inventoryAnalytics");

test("inventory categories separate products from warehouse supplies", () => {
  assert.equal(inventoryCategory({ item: "8x8x4 Boxes" }), "Warehouse Supplies");
  assert.equal(inventoryCategory({ item: "Bubble Mailers" }), "Warehouse Supplies");
  assert.equal(inventoryCategory({ item: "Ascended Heroes Mega Emboar ex Box" }), "Pokémon Products");
  assert.equal(inventoryCategory({ item: "Perfect Order Sleeved Booster Pack" }), "Pokémon Products");
  assert.equal(inventoryCategory({ item: "Anything", category: "Custom Category" }), "Custom Category");
});

test("inventory summary calculates stock statuses with normal code", () => {
  const result = summarizeInventory([
    { item: "A", quantity: 0, lowStockLevel: 2, reorderAmount: 10 },
    { item: "B", quantity: 2, lowStockLevel: 3, reorderAmount: 5 },
    { item: "C", quantity: 10, lowStockLevel: 3, reorderAmount: 4 }
  ]);
  assert.equal(result.totalItems, 3); assert.equal(result.totalUnits, 12);
  assert.equal(result.outOfStockItems, 1); assert.equal(result.lowStockItems, 1);
  assert.deepEqual(result.items.map(item => item.stockStatus), ["Out of stock", "Low stock", "In stock"]);
});
