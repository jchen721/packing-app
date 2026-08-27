const test = require("node:test");
const assert = require("node:assert/strict");
const { selectInventoryLockWinner, normalizeCatalogInput, historyContainsOperationId, rowsToInventoryLocks } = require("../googleInventoryManager");

test("shared inventory lock selects the earliest active or review-required operation", () => {
  assert.equal(selectInventoryLockWinner([
    ["", "done", "", "COMPLETED"], ["", "first", "", "ACTIVE"], ["", "second", "", "ACTIVE"]
  ])[1], "first");
  assert.equal(selectInventoryLockWinner([["", "review", "", "NEEDS_REVIEW"], ["", "later", "", "ACTIVE"]])[1], "review");
  assert.equal(selectInventoryLockWinner([["", "done", "", "COMPLETED"]]), null);
});

test("shared inventory lock rows map only the operational audit fields", () => {
  assert.deepEqual(rowsToInventoryLocks([
    ["2026-08-07T10:00:00.000Z", "lock-1", "Approve live set set-1", "ACTIVE", "Alice", "2026-08-07T10:00:01.000Z", "", "ignored"]
  ]), [{
    createdAt: "2026-08-07T10:00:00.000Z",
    lockId: "lock-1",
    operation: "Approve live set set-1",
    status: "ACTIVE",
    user: "Alice",
    updatedAt: "2026-08-07T10:00:01.000Z",
    error: ""
  }]);
});

test("shared history IDs provide receipt retry idempotency", () => {
  const rows = [["receipt-1"], ["receipt-2"]];
  assert.equal(historyContainsOperationId(rows, "receipt-2"), true);
  assert.equal(historyContainsOperationId(rows, "receipt-3"), false);
  assert.equal(historyContainsOperationId(rows, ""), false);
});

test("new inventory catalog input validates category, quantities, and user", () => {
  assert.deepEqual(normalizeCatalogInput({ item: "New ETB", quantity: 5, lowStockLevel: 2, reorderAmount: 10, category: "Pokémon Products", user: "Alice", reason: "New release" }), {
    item: "New ETB", quantity: 5, lowStockLevel: 2, reorderAmount: 10, category: "Pokémon Products", user: "Alice", reason: "New release"
  });
  assert.throws(() => normalizeCatalogInput({ item: "Bad", quantity: -1, category: "Pokémon Products", user: "Alice" }), /Starting quantity/);
  assert.throws(() => normalizeCatalogInput({ item: "Bad", category: "Unknown", user: "Alice" }), /Choose/);
});
