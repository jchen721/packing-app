const test = require("node:test");
const assert = require("node:assert/strict");
const { compareBatchHistory, createOperationRecoveryService } = require("../operationRecovery");

const batchId = "a".repeat(64);
const now = new Date("2026-08-10T12:00:00.000Z");
const oldTime = "2026-08-10T11:30:00.000Z";
const recentTime = "2026-08-10T11:55:00.000Z";
const usage = [{ item: "Gem Packs", quantity: 12 }, { item: "8x8x4 Boxes", quantity: 3 }];

function setup({ locks = [], batchRows = [], history = [], recoveryError = null } = {}) {
  const calls = { resolvedLocks: [], recoveredBatches: [], localUpdates: [] };
  const service = createOperationRecoveryService({
    now: () => now,
    minimumAgeMinutes: 15,
    lockGateway: {
      async readInventoryLocks() { return locks; },
      async resolveInventoryLockRecord(lockId, metadata) {
        if (recoveryError) throw recoveryError;
        calls.resolvedLocks.push({ lockId, metadata });
        return { lockId, status: "RESOLVED" };
      }
    },
    batchGateway: {
      async listRecords() { return batchRows; },
      async recoverBatchReservation(id, metadata) {
        if (recoveryError) throw recoveryError;
        calls.recoveredBatches.push({ batchId: id, ...metadata });
        return { batchId: id, status: metadata.status, rowsUpdated: 2 };
      }
    },
    async historyReader() { return history; },
    async batchLoader() { return { usage }; },
    async localBatchUpdater(id, metadata) { calls.localUpdates.push({ batchId: id, metadata }); }
  });
  return { service, calls };
}

const confirmation = { user: "Manager", reason: "Verified inventory and history", acknowledged: true };

test("batch history comparison requires every exact deduction quantity", () => {
  const exact = compareBatchHistory(usage, [
    { item: "Gem Packs", quantityChanged: -10, actionType: "DEDUCTION" },
    { item: "gem packs", quantityChanged: -2, actionType: "DEDUCTION" },
    { item: "8x8x4 Boxes", quantityChanged: -3, actionType: "DEDUCTION" },
    { item: "Gem Packs", quantityChanged: 20, actionType: "RECEIVED" }
  ]);
  assert.equal(exact.exact, true);
  assert.equal(exact.differences.length, 0);
  const partial = compareBatchHistory(usage, [{ item: "Gem Packs", quantityChanged: -11, actionType: "DEDUCTION" }]);
  assert.equal(partial.exact, false);
  assert.equal(partial.hasHistory, true);
  assert.deepEqual(partial.differences.map(row => [row.item, row.expectedQuantity, row.recordedQuantity]), [["Gem Packs", 12, 11], ["8x8x4 Boxes", 3, 0]]);
});

test("recent active lock cannot be overridden", async () => {
  const { service, calls } = setup({ locks: [{ lockId: "lock-1", status: "ACTIVE", createdAt: recentTime, updatedAt: recentTime }] });
  const assessment = await service.assessLock("lock-1");
  assert.equal(assessment.state, "wait");
  assert.equal(assessment.canResolve, false);
  await assert.rejects(service.resolveLock("lock-1", confirmation), /Wait at least/);
  assert.equal(calls.resolvedLocks.length, 0);
});

test("stale active and review locks require explicit manager reconciliation", async () => {
  const stale = setup({ locks: [{ lockId: "lock-2", status: "ACTIVE", createdAt: oldTime, updatedAt: oldTime }] });
  await assert.rejects(stale.service.resolveLock("lock-2", { ...confirmation, acknowledged: false }), /Confirm that Google Sheets/);
  const result = await stale.service.resolveLock("lock-2", confirmation);
  assert.equal(result.success, true);
  assert.equal(stale.calls.resolvedLocks.length, 1);

  const review = setup({ locks: [{ lockId: "lock-3", status: "NEEDS_REVIEW", createdAt: recentTime, updatedAt: recentTime }] });
  const assessment = await review.service.assessLock("lock-3");
  assert.equal(assessment.state, "manual_reconciliation");
  assert.equal(assessment.canResolve, true);
});

test("reserved batch finalizes only when deduction history exactly matches", async () => {
  const history = [
    { batchId, item: "Gem Packs", quantityChanged: -12, actionType: "DEDUCTION" },
    { batchId, item: "8x8x4 Boxes", quantityChanged: -3, actionType: "DEDUCTION" }
  ];
  const { service, calls } = setup({ batchRows: [{ batchId, status: "RESERVED", createdAt: oldTime, updatedAt: oldTime }], history });
  const assessment = await service.assessBatch(batchId);
  assert.equal(assessment.state, "safe_finalize");
  const result = await service.recoverBatch(batchId, confirmation);
  assert.equal(result.status, "CONFIRMED");
  assert.deepEqual(calls.recoveredBatches, [{ batchId, status: "CONFIRMED", user: "Manager" }]);
  assert.equal(calls.localUpdates.length, 1);
});

test("abandoned reservation releases only with no history and no blocking lock", async () => {
  const { service, calls } = setup({ batchRows: [{ batchId, status: "RESERVED", createdAt: oldTime, updatedAt: oldTime }] });
  const assessment = await service.assessBatch(batchId);
  assert.equal(assessment.state, "safe_release");
  const result = await service.recoverBatch(batchId, confirmation);
  assert.equal(result.status, "FAILED");
  assert.deepEqual(calls.recoveredBatches, [{ batchId, status: "FAILED", user: "Manager" }]);
  assert.equal(calls.localUpdates.length, 0);
});

test("partial history or a related blocking lock prevents batch recovery", async () => {
  const partial = setup({
    batchRows: [{ batchId, status: "RESERVED", createdAt: oldTime, updatedAt: oldTime }],
    history: [{ batchId, item: "Gem Packs", quantityChanged: -4, actionType: "DEDUCTION" }]
  });
  assert.equal((await partial.service.assessBatch(batchId)).state, "manual_review");
  await assert.rejects(partial.service.recoverBatch(batchId, confirmation), /partially matches/);
  assert.equal(partial.calls.recoveredBatches.length, 0);

  const locked = setup({
    batchRows: [{ batchId, status: "RESERVED", createdAt: oldTime, updatedAt: oldTime }],
    locks: [{ lockId: "lock-4", operation: `DEDUCTION:${batchId}`, status: "NEEDS_REVIEW", createdAt: oldTime, updatedAt: oldTime }]
  });
  assert.equal((await locked.service.assessBatch(batchId)).state, "manual_review");
  assert.equal(locked.calls.recoveredBatches.length, 0);
});

test("Google Sheets recovery failure is returned and never reported as success", async () => {
  const { service, calls } = setup({
    batchRows: [{ batchId, status: "RESERVED", createdAt: oldTime, updatedAt: oldTime }],
    recoveryError: new Error("Sheets write unavailable")
  });
  await assert.rejects(service.recoverBatch(batchId, confirmation), /Sheets write unavailable/);
  assert.equal(calls.localUpdates.length, 0);
});
