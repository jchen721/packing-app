const test = require("node:test");
const assert = require("node:assert/strict");
const { buildInventoryAvailability, assertInventoryAvailability } = require("../inventoryAvailability");

test("packing review calculates current and proposed inventory quantities", () => {
  const rows = buildInventoryAvailability(
    [{ item: "Test ETB", quantity: 4 }, { item: "8x8x4 Boxes", quantity: 2 }],
    [{ item: "Test ETB", quantity: 10, category: "Pokémon Products" }, { item: "8x8x4 Boxes", quantity: 5, category: "Warehouse Supplies" }]
  );
  assert.deepEqual(rows.map(row => [row.item, row.currentQuantity, row.newQuantity, row.status]), [["Test ETB", 10, 6, "READY"], ["8x8x4 Boxes", 5, 3, "READY"]]);
  assert.equal(assertInventoryAvailability(rows), true);
});

test("packing confirmation rejects missing and insufficient shared stock", () => {
  const rows = buildInventoryAvailability(
    [{ item: "Test ETB", quantity: 11 }, { item: "Missing Box", quantity: 1 }],
    [{ item: "Test ETB", quantity: 10, category: "Pokémon Products" }]
  );
  assert.equal(rows[0].status, "INSUFFICIENT");
  assert.equal(rows[1].status, "MISSING");
  assert.throws(() => assertInventoryAvailability(rows), /not found.*Missing Box/);
  assert.throws(() => assertInventoryAvailability([rows[0]]), /stock 10, required 11/);
});
