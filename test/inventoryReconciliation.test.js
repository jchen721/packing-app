const test = require("node:test");
const assert = require("node:assert/strict");

const { buildInventoryReconciliation, createInventoryReconciliationService } = require("../inventoryReconciliation");
const { appendInventoryReconciliationHistory } = require("../googleInventoryManager");

const inventory = [
  { item: "Chaos ETB", category: "Pokémon Products", quantity: 12 },
  { item: "8x8x4 Boxes", category: "Warehouse Supplies", quantity: 40 }
];

test("inventory reconciliation detects direct Sheet changes and new history baselines", () => {
  const result = buildInventoryReconciliation(inventory, [
    { timestamp: "2026-08-08T10:00:00Z", item: "Chaos ETB", newQuantity: 10 }
  ]);
  assert.equal(result.unrecordedChanges, 1);
  assert.equal(result.baselinesRequired, 1);
  assert.deepEqual(result.rows[0], {
    item: "Chaos ETB", category: "Pokémon Products", previousQuantity: 10, quantityChanged: 2, newQuantity: 12,
    status: "UNRECORDED_SHEET_CHANGE", baseline: false, lastRecordedAt: "2026-08-08T10:00:00Z"
  });
  assert.equal(result.rows[1].status, "BASELINE_REQUIRED");
  assert.equal(result.rows[1].quantityChanged, 0);
});

test("matching current inventory and latest history needs no reconciliation", () => {
  const result = buildInventoryReconciliation(inventory, [
    { timestamp: "2026-08-08T10:00:00Z", item: "Chaos ETB", newQuantity: 12 },
    { timestamp: "2026-08-08T10:00:00Z", item: "8x8x4 Boxes", newQuantity: 40 }
  ]);
  assert.equal(result.ready, true);
  assert.deepEqual(result.rows, []);
});

function createFixture({ appendFails = false } = {}) {
  let history = [{ timestamp: "2026-08-08T10:00:00Z", item: "Chaos ETB", category: "Pokémon Products", newQuantity: 10 }];
  let lockCalls = 0;
  let appended = [];
  const service = createInventoryReconciliationService({
    inventoryReader: async () => inventory,
    historyReader: async () => history,
    sharedLock: async (metadata, task) => { lockCalls += 1; return task({ fake: true }); },
    historyAppender: async (records, metadata) => {
      if (appendFails) throw new Error("Google history unavailable");
      appended = records;
      history = records.map(record => ({ timestamp: "2026-08-08T11:00:00Z", item: record.item, category: record.category, newQuantity: record.newQuantity }));
      return { transactionId: metadata.transactionId, recordsWritten: records.length };
    }
  });
  return { service, get lockCalls() { return lockCalls; }, get appended() { return appended; } };
}

test("confirmed reconciliation records corrections and baselines without changing inventory", async () => {
  const fixture = createFixture();
  const result = await fixture.service.confirm({ user: "Alice", reason: "Manager Sheet audit" });
  assert.equal(result.recordsWritten, 2);
  assert.equal(fixture.lockCalls, 1);
  assert.equal(fixture.appended[0].quantityChanged, 2);
  assert.equal(fixture.appended[1].baseline, true);
  const retry = await fixture.service.confirm({ user: "Alice", reason: "Manager Sheet audit" });
  assert.equal(retry.recordsWritten, 0);
});

test("failed reconciliation history remains visible for a safe retry", async () => {
  const fixture = createFixture({ appendFails: true });
  await assert.rejects(fixture.service.confirm({ user: "Alice" }), /Google history unavailable/);
  const preview = await fixture.service.preview();
  assert.equal(preview.rows.length, 2);
});

test("reconciliation requires the manager identity before acquiring the lock", async () => {
  const fixture = createFixture();
  await assert.rejects(fixture.service.confirm({ reason: "Audit" }), /User is required/);
  assert.equal(fixture.lockCalls, 0);
});

test("Google reconciliation history rows contain complete correction metadata", async () => {
  let appended;
  const sheets = { spreadsheets: { values: { async append(input) { appended = input.requestBody.values; } } } };
  const result = await appendInventoryReconciliationHistory([
    { item: "Chaos ETB", category: "Pokémon Products", previousQuantity: 10, quantityChanged: 2, newQuantity: 12, baseline: false },
    { item: "8x8x4 Boxes", category: "Warehouse Supplies", previousQuantity: 40, quantityChanged: 0, newQuantity: 40, baseline: true }
  ], { transactionId: "reconcile-1", user: "Alice", reason: "Direct Sheet audit" }, sheets);
  assert.equal(result.recordsWritten, 2);
  assert.equal(appended[0][1], "reconcile-1");
  assert.deepEqual(appended[0].slice(2), ["Chaos ETB", "Pokémon Products", 10, 2, 12, "CORRECTION", "Direct Sheet audit", "Alice"]);
  assert.match(appended[1][8], /history baseline/);
});
