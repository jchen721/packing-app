function minutesSince(value, now) {
  const timestamp = new Date(value || "").getTime();
  if (!Number.isFinite(timestamp)) return Infinity;
  return Math.max(0, (now.getTime() - timestamp) / 60000);
}

function quantityMap(rows, { history = false } = {}) {
  const result = new Map();
  for (const row of rows || []) {
    const item = String(row.item || "").trim();
    const rawQuantity = history ? -Number(row.quantityChanged) : Number(row.quantity);
    if (!item || !Number.isFinite(rawQuantity) || rawQuantity <= 0) continue;
    const key = item.toLowerCase();
    const existing = result.get(key) || { item, quantity: 0 };
    existing.quantity += rawQuantity;
    result.set(key, existing);
  }
  return result;
}

function compareBatchHistory(expectedUsage, historyRows) {
  const expected = quantityMap(expectedUsage);
  const actual = quantityMap(historyRows.filter(row => String(row.actionType || "").toUpperCase() === "DEDUCTION"), { history: true });
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  const differences = [...keys].flatMap(key => {
    const expectedRow = expected.get(key);
    const actualRow = actual.get(key);
    const expectedQuantity = expectedRow?.quantity || 0;
    const recordedQuantity = actualRow?.quantity || 0;
    if (expectedQuantity === recordedQuantity) return [];
    return [{ item: expectedRow?.item || actualRow?.item || key, expectedQuantity, recordedQuantity }];
  });
  return {
    exact: expected.size > 0 && differences.length === 0,
    hasHistory: actual.size > 0,
    differences
  };
}

function validateRecoveryConfirmation(input) {
  const user = String(input.user || "").trim();
  const reason = String(input.reason || "").trim();
  if (!user) throw new Error("Manager name is required.");
  if (reason.length < 8) throw new Error("Enter a clear recovery reason of at least 8 characters.");
  if (input.acknowledged !== true) throw new Error("Confirm that Google Sheets inventory and history were reconciled.");
  return { user, reason };
}

function createOperationRecoveryService({
  lockGateway,
  batchGateway,
  historyReader,
  batchLoader,
  localBatchUpdater = async () => {},
  now = () => new Date(),
  minimumAgeMinutes = 15
}) {
  if (!lockGateway || !batchGateway || !historyReader || !batchLoader) throw new Error("Operation recovery requires lock, batch, history, and manifest gateways.");

  async function assessLock(lockId) {
    const lock = (await lockGateway.readInventoryLocks(500)).find(row => row.lockId === lockId);
    if (!lock) throw new Error("Shared operation lock was not found.");
    const status = String(lock.status || "").toUpperCase();
    const ageMinutes = minutesSince(lock.updatedAt || lock.createdAt, now());
    if (!["ACTIVE", "NEEDS_REVIEW"].includes(status)) {
      return { lock, state: "no_action", canResolve: false, ageMinutes, message: `This lock is already ${status || "closed"}.` };
    }
    if (status === "ACTIVE" && ageMinutes < minimumAgeMinutes) {
      return { lock, state: "wait", canResolve: false, ageMinutes, message: `This operation was updated recently. Wait at least ${minimumAgeMinutes} minutes before treating it as abandoned.` };
    }
    return {
      lock,
      state: status === "NEEDS_REVIEW" ? "manual_reconciliation" : "stale_active",
      canResolve: true,
      ageMinutes,
      message: status === "NEEDS_REVIEW"
        ? "Inventory and history must be reconciled before this review lock is resolved."
        : "This active lock is old enough to be treated as abandoned after inventory and history are checked."
    };
  }

  async function resolveLock(lockId, input) {
    const metadata = validateRecoveryConfirmation(input);
    const assessment = await assessLock(lockId);
    if (!assessment.canResolve) throw new Error(assessment.message);
    const result = await lockGateway.resolveInventoryLockRecord(lockId, metadata);
    return { success: true, state: "resolved", assessment, result };
  }

  async function assessBatch(batchId) {
    const loaded = await batchLoader(batchId);
    const [rows, batchHistory, locks] = await Promise.all([
      batchGateway.listRecords(),
      historyReader(batchId),
      lockGateway.readInventoryLocks(500)
    ]);
    const reservedRows = rows.filter(row => row.batchId === batchId && row.status === "RESERVED");
    const confirmedRows = rows.filter(row => row.batchId === batchId && row.status === "CONFIRMED");
    const matchingHistory = batchHistory.filter(row => row.batchId === batchId);
    const comparison = compareBatchHistory(loaded.usage, matchingHistory);
    const blockingLocks = locks.filter(lock => lock.operation === `DEDUCTION:${batchId}` && ["ACTIVE", "NEEDS_REVIEW"].includes(String(lock.status || "").toUpperCase()));
    const reservationAgeMinutes = reservedRows.length
      ? Math.min(...reservedRows.map(row => minutesSince(row.updatedAt || row.createdAt, now())))
      : null;

    if (confirmedRows.length) return { batchId, state: "already_confirmed", canRecover: false, comparison, blockingLocks, reservationAgeMinutes, message: "This batch is already confirmed in the shared registry." };
    if (!reservedRows.length) return { batchId, state: "no_reservation", canRecover: false, comparison, blockingLocks, reservationAgeMinutes, message: "This batch has no unresolved shared reservation." };
    if (blockingLocks.length) return { batchId, state: "manual_review", canRecover: false, comparison, blockingLocks, reservationAgeMinutes, message: "Resolve the related inventory lock only after reconciling quantities and history." };
    if (comparison.exact) return { batchId, state: "safe_finalize", canRecover: true, comparison, blockingLocks, reservationAgeMinutes, message: "Inventory History exactly matches this batch. The shared reservation can be finalized as confirmed." };
    if (comparison.hasHistory) return { batchId, state: "manual_review", canRecover: false, comparison, blockingLocks, reservationAgeMinutes, message: "Inventory History only partially matches this batch. Do not release or finalize it automatically." };
    if (reservationAgeMinutes < minimumAgeMinutes) return { batchId, state: "wait", canRecover: false, comparison, blockingLocks, reservationAgeMinutes, message: `The reservation is recent. Wait at least ${minimumAgeMinutes} minutes before treating it as abandoned.` };
    return { batchId, state: "safe_release", canRecover: true, comparison, blockingLocks, reservationAgeMinutes, message: "No matching deduction history or blocking inventory lock was found. The abandoned reservation can be released for a reviewed retry." };
  }

  async function recoverBatch(batchId, input) {
    const metadata = validateRecoveryConfirmation(input);
    const assessment = await assessBatch(batchId);
    if (!assessment.canRecover) throw new Error(assessment.message);
    const status = assessment.state === "safe_finalize" ? "CONFIRMED" : "FAILED";
    const result = await batchGateway.recoverBatchReservation(batchId, { status, user: metadata.user });
    let localWarning = "";
    if (status === "CONFIRMED") {
      try { await localBatchUpdater(batchId, { user: metadata.user, reason: metadata.reason }); }
      catch (error) { localWarning = `Shared recovery succeeded, but the local batch backup could not be updated: ${error.message}`; }
    }
    return { success: true, batchId, status, assessment, result, localWarning };
  }

  return { assessLock, resolveLock, assessBatch, recoverBatch };
}

module.exports = { minutesSince, compareBatchHistory, validateRecoveryConfirmation, createOperationRecoveryService };
