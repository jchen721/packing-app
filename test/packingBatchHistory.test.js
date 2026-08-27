const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  listLocalPackingBatches,
  summarizeSharedBatchRows,
  combinePackingBatchHistory,
  summarizePackingBatchOperations
} = require("../packingBatchHistory");

const BATCH_ID = "a".repeat(64);

function writeRun(outputsDir, runId, overrides = {}) {
  const runDir = path.join(outputsDir, runId);
  fs.mkdirSync(runDir);
  const batch = {
    batchId: BATCH_ID,
    runId,
    createdAt: "2026-08-01T10:00:00.000Z",
    status: "awaiting_inventory_confirmation",
    zipFile: `packing_output_${runId}.zip`,
    totalOrders: 3,
    processedPages: 6,
    ordersNeedingReview: 1,
    ...overrides
  };
  fs.writeFileSync(path.join(runDir, "batch.json"), JSON.stringify(batch));
  return batch;
}

test("local batch history combines repeated runs of the same PDF", () => {
  const outputsDir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-history-"));
  writeRun(outputsDir, "run-1");
  writeRun(outputsDir, "run-2", { createdAt: "2026-08-02T10:00:00.000Z" });
  fs.writeFileSync(path.join(outputsDir, "packing_output_run-1.zip"), "zip");
  fs.mkdirSync(path.join(outputsDir, "invalid-run"));
  fs.writeFileSync(path.join(outputsDir, "invalid-run", "batch.json"), "not json");

  const batches = listLocalPackingBatches(outputsDir);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].runCount, 2);
  assert.equal(batches[0].runId, "run-2");
  assert.equal(batches[0].downloadAvailable, true);
});

test("shared batch rows summarize protected orders and strongest status", () => {
  const summary = summarizeSharedBatchRows([
    { batchId: BATCH_ID, orderKey: "order:1", status: "FAILED", user: "Alice", attemptId: "one", updatedAt: "2026-08-01" },
    { batchId: BATCH_ID, orderKey: "order:1", status: "CONFIRMED", user: "Bob", attemptId: "two", updatedAt: "2026-08-02" },
    { batchId: BATCH_ID, orderKey: "order:2", status: "CONFIRMED", user: "Bob", attemptId: "two", updatedAt: "2026-08-02" }
  ]).get(BATCH_ID);

  assert.equal(summary.status, "CONFIRMED");
  assert.equal(summary.user, "Bob");
  assert.equal(summary.protectedOrderCount, 2);
  assert.equal(summary.attemptCount, 2);
});

test("shared confirmation overrides a newer local awaiting run", () => {
  const local = [{
    batchId: BATCH_ID,
    runId: "rerun",
    createdAt: "2026-08-03T00:00:00.000Z",
    localStatus: "awaiting_inventory_confirmation",
    confirmedBy: null
  }];
  const rows = [{
    batchId: BATCH_ID,
    orderKey: "order:1",
    status: "CONFIRMED",
    user: "Manager",
    attemptId: "attempt",
    updatedAt: "2026-08-02T00:00:00.000Z"
  }];

  const [batch] = combinePackingBatchHistory(local, rows);
  assert.equal(batch.status, "Inventory confirmed");
  assert.equal(batch.confirmedBy, "Manager");
  assert.equal(batch.protectedOrderCount, 1);
});

test("failed reservations remain distinguishable from unconfirmed batches", () => {
  const local = [{ batchId: BATCH_ID, localStatus: "awaiting_inventory_confirmation" }];
  const rows = [{ batchId: BATCH_ID, status: "FAILED", orderKey: "order:1", attemptId: "attempt" }];
  assert.equal(combinePackingBatchHistory(local, rows)[0].status, "Confirmation failed — safe to review and retry");
  assert.equal(combinePackingBatchHistory(local, [])[0].status, "Awaiting inventory confirmation");
});

test("dashboard batch summary reports actionable states and repeated runs", () => {
  const summary = summarizePackingBatchOperations([
    { status: "Awaiting inventory confirmation", runCount: 2 },
    { status: "Inventory confirmed", runCount: 1 },
    { status: "Confirmation in progress / review required", runCount: 1 },
    { status: "Confirmation failed — safe to review and retry", runCount: 1 }
  ]);

  assert.equal(summary.totalBatches, 4);
  assert.equal(summary.totalRuns, 5);
  assert.equal(summary.awaitingConfirmation, 1);
  assert.equal(summary.confirmed, 1);
  assert.equal(summary.inProgressOrReview, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.repeatedBatches, 1);
  assert.deepEqual(summary.warnings.map(warning => warning.priority), ["HIGH", "MEDIUM", "ACTION", "INFO"]);
});

test("dashboard batch summary is empty and calm with no batches", () => {
  const summary = summarizePackingBatchOperations([]);
  assert.equal(summary.totalBatches, 0);
  assert.equal(summary.totalRuns, 0);
  assert.deepEqual(summary.warnings, []);
  assert.deepEqual(summary.recentBatches, []);
});
