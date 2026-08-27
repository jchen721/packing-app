const test = require("node:test");
const assert = require("node:assert/strict");

const { validateWorkerLog, buildWorkerLogForOrder } = require("../workerTracker");
const { rowsToWorkerLogs } = require("../googleWorkerTracker");

const BATCH_ID = "b".repeat(64);

test("worker activity requires a batch, order, worker, and supported action", () => {
  assert.deepEqual(validateWorkerLog({
    batchId: BATCH_ID,
    worker: " Ace 1 ",
    action: "done",
    orderId: " 100 ",
    buyerNickname: "Buyer",
    finalGroup: "8x8x4"
  }), {
    batchId: BATCH_ID,
    worker: "Ace 1",
    action: "DONE",
    orderId: "100",
    buyerNickname: "Buyer",
    finalGroup: "8x8x4"
  });

  assert.throws(() => validateWorkerLog({ batchId: "bad", worker: "Ace 1", action: "DONE", orderId: "100" }), /valid packing batch/);
  assert.throws(() => validateWorkerLog({ batchId: BATCH_ID, worker: "", action: "DONE", orderId: "100" }), /worker name/);
  assert.throws(() => validateWorkerLog({ batchId: BATCH_ID, worker: "Ace 1", action: "DELETE", orderId: "100" }), /START, DONE, or ISSUE/);
});

test("shared packing activity rows map without exposing extra sheet columns", () => {
  assert.deepEqual(rowsToWorkerLogs([
    ["2026-08-03T00:00:00.000Z", BATCH_ID, "100", "Ace 2", "START", "Buyer", "16_Box", "ignored"],
    ["", "", "", "", "", "", ""]
  ]), [{
    timestamp: "2026-08-03T00:00:00.000Z",
    batchId: BATCH_ID,
    orderId: "100",
    worker: "Ace 2",
    action: "START",
    buyerNickname: "Buyer",
    finalGroup: "16_Box"
  }]);
});

test("worker activity uses authoritative buyer and packing group from the batch", () => {
  const result = buildWorkerLogForOrder({
    batchId: BATCH_ID,
    worker: "Ace 3",
    action: "ISSUE",
    orderId: "100",
    buyerNickname: "browser supplied buyer",
    finalGroup: "browser supplied group"
  }, {
    buyerNickname: "Actual Buyer",
    finalGroup: "Needs_Review"
  });

  assert.equal(result.buyerNickname, "Actual Buyer");
  assert.equal(result.finalGroup, "Needs_Review");
});
