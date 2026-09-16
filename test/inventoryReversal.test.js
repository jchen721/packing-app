const test = require("node:test");
const assert = require("node:assert/strict");

const { reversalTransactionId, buildInventoryReversal } = require("../googleInventoryManager");

const inventory = [
  { item: "7x5x5 Boxes", category: "Warehouse Supplies", quantity: 23, quantityVerified: true, sheetName: "Box Inventory", rowNumber: 3 },
  { item: "Bubble Mailers", category: "Warehouse Supplies", quantity: 100, quantityVerified: true, sheetName: "Box Inventory", rowNumber: 20 }
];

test("deduction reversal adds the complete transaction back", () => {
  const preview = buildInventoryReversal("batch-1", [
    { item: "7x5x5 Boxes", category: "Warehouse Supplies", quantityChanged: -77, actionType: "DEDUCTION" },
    { item: "Bubble Mailers", category: "Warehouse Supplies", quantityChanged: -5, actionType: "DEDUCTION" }
  ], inventory);
  assert.equal(preview.reversalTransactionId, "reversal:batch-1");
  assert.deepEqual(preview.changes.map(change => [change.item, change.previousQuantity, change.quantityChanged, change.newQuantity]), [
    ["7x5x5 Boxes", 23, 77, 100],
    ["Bubble Mailers", 100, 5, 105]
  ]);
});

test("received inventory reversal subtracts the received quantity", () => {
  const preview = buildInventoryReversal("receipt-1", [
    { item: "7x5x5 Boxes", category: "Warehouse Supplies", quantityChanged: 10, actionType: "RECEIVED" }
  ], inventory);
  assert.equal(preview.changes[0].newQuantity, 13);
  assert.equal(preview.changes[0].quantityChanged, -10);
});

test("reversal blocks unsupported history and negative inventory", () => {
  assert.throws(() => buildInventoryReversal("correction-1", [
    { item: "7x5x5 Boxes", quantityChanged: 2, actionType: "CORRECTION" }
  ], inventory), /Only deduction or received/);
  assert.throws(() => buildInventoryReversal("receipt-2", [
    { item: "7x5x5 Boxes", quantityChanged: 30, actionType: "RECEIVED" }
  ], inventory), /negative/);
  assert.throws(() => reversalTransactionId("reversal:batch-1"), /original inventory transaction/);
});
