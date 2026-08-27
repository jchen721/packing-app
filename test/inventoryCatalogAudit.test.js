const test = require("node:test");
const assert = require("node:assert/strict");
const { expectedInventoryCategory, recommendedInventoryName, auditInventoryCatalog } = require("../inventoryCatalogAudit");

test("catalog audit recognizes warehouse supplies without confusing product boxes", () => {
  assert.equal(expectedInventoryCategory("8x8x4"), "Warehouse Supplies");
  assert.equal(expectedInventoryCategory("16x12x6 Boxes"), "Warehouse Supplies");
  assert.equal(expectedInventoryCategory("Top Loaders"), "Warehouse Supplies");
  assert.equal(expectedInventoryCategory("Bubble Mailers"), "Warehouse Supplies");
  assert.equal(expectedInventoryCategory("Ascended Heroes Mega Emboar ex Box"), "Pokémon Products");
  assert.equal(expectedInventoryCategory("Chaos Rising ETB"), "Pokémon Products");
  assert.equal(recommendedInventoryName("8x8x4"), "8x8x4 Boxes");
  assert.equal(recommendedInventoryName("8x8x4 Boxes"), "8x8x4 Boxes");
});

test("catalog audit reports exact Sheet moves but leaves ambiguous items alone", () => {
  const result = auditInventoryCatalog([
    { item: "Top Loaders", category: "Pokémon Products", sheetName: "Inventory" },
    { item: "Chaos Rising ETB", category: "Warehouse Supplies", sheetName: "Warehouse Supplies" },
    { item: "8x8x4", category: "Warehouse Supplies", sheetName: "Warehouse Supplies" },
    { item: "Display Stand", category: "Warehouse Supplies", sheetName: "Warehouse Supplies" }
  ]);
  assert.equal(result.ready, false);
  assert.equal(result.issueCount, 3);
  assert.deepEqual(result.issues.map(row => [row.item, row.expectedItemName, row.expectedSheet]), [
    ["Top Loaders", "Top Loaders", "Warehouse Supplies"],
    ["Chaos Rising ETB", "Chaos Rising ETB", "Inventory"],
    ["8x8x4", "8x8x4 Boxes", "Warehouse Supplies"]
  ]);
});
