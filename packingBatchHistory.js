const fs = require("fs");
const path = require("path");

const SHARED_STATUS_PRIORITY = {
  CONFIRMED: 4,
  RESERVED: 3,
  FAILED: 2,
  CANCELLED: 1
};

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function listLocalPackingBatches(outputsDir) {
  if (!fs.existsSync(outputsDir)) return [];
  const grouped = new Map();

  for (const runId of fs.readdirSync(outputsDir)) {
    const runDir = path.join(outputsDir, runId);
    let stat;
    try { stat = fs.statSync(runDir); } catch { continue; }
    if (!stat.isDirectory()) continue;

    const batch = safeReadJson(path.join(runDir, "batch.json"));
    if (!batch || !/^[a-f0-9]{64}$/.test(String(batch.batchId || ""))) continue;
    const existing = grouped.get(batch.batchId);
    const createdAt = batch.createdAt || stat.mtime.toISOString();
    const candidate = {
      batchId: batch.batchId,
      runId: batch.runId || runId,
      createdAt,
      updatedAt: batch.confirmedAt || createdAt,
      totalOrders: Number(batch.totalOrders) || 0,
      processedPages: Number(batch.processedPages) || 0,
      ordersNeedingReview: Number(batch.ordersNeedingReview) || 0,
      localStatus: batch.status || "awaiting_inventory_confirmation",
      confirmedAt: batch.confirmedAt || null,
      confirmedBy: batch.confirmedBy || null,
      downloadAvailable: Boolean(batch.zipFile && fs.existsSync(path.join(outputsDir, batch.zipFile))),
      runCount: 1
    };

    if (!existing) {
      grouped.set(batch.batchId, candidate);
      continue;
    }

    existing.runCount += 1;
    if (candidate.localStatus === "inventory_confirmed") {
      existing.localStatus = candidate.localStatus;
      existing.confirmedAt = candidate.confirmedAt || existing.confirmedAt;
      existing.confirmedBy = candidate.confirmedBy || existing.confirmedBy;
    }
    if (new Date(candidate.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      const preserved = {
        runCount: existing.runCount,
        localStatus: existing.localStatus,
        confirmedAt: existing.confirmedAt,
        confirmedBy: existing.confirmedBy,
        downloadAvailable: existing.downloadAvailable || candidate.downloadAvailable
      };
      Object.assign(existing, candidate, preserved);
    } else if (candidate.downloadAvailable) {
      existing.downloadAvailable = true;
    }
  }

  return [...grouped.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function summarizeSharedBatchRows(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    if (!row.batchId) continue;
    const existing = grouped.get(row.batchId) || {
      batchId: row.batchId,
      status: "",
      user: "",
      updatedAt: "",
      orderKeys: new Set(),
      attemptIds: new Set()
    };
    if (row.orderKey) existing.orderKeys.add(row.orderKey);
    if (row.attemptId) existing.attemptIds.add(row.attemptId);
    if ((SHARED_STATUS_PRIORITY[row.status] || 0) > (SHARED_STATUS_PRIORITY[existing.status] || 0)) {
      existing.status = row.status;
      existing.user = row.user || "";
    }
    if (String(row.updatedAt || "") > existing.updatedAt) existing.updatedAt = row.updatedAt;
    grouped.set(row.batchId, existing);
  }

  return new Map([...grouped].map(([batchId, value]) => [batchId, {
    batchId,
    status: value.status,
    user: value.user,
    updatedAt: value.updatedAt,
    protectedOrderCount: value.orderKeys.size,
    attemptCount: value.attemptIds.size
  }]));
}

function displayStatus(localStatus, sharedStatus) {
  if (sharedStatus === "CONFIRMED" || localStatus === "inventory_confirmed") return "Inventory confirmed";
  if (sharedStatus === "RESERVED") return "Confirmation in progress / review required";
  if (sharedStatus === "FAILED") return "Confirmation failed — safe to review and retry";
  return "Awaiting inventory confirmation";
}

function combinePackingBatchHistory(localBatches, sharedRows = []) {
  const shared = summarizeSharedBatchRows(sharedRows);
  return localBatches.map(batch => {
    const remote = shared.get(batch.batchId);
    return {
      ...batch,
      status: displayStatus(batch.localStatus, remote?.status),
      sharedStatus: remote?.status || null,
      confirmedBy: remote?.status === "CONFIRMED" ? remote.user || batch.confirmedBy : batch.confirmedBy,
      confirmedAt: remote?.status === "CONFIRMED" ? remote.updatedAt || batch.confirmedAt : batch.confirmedAt,
      protectedOrderCount: remote?.protectedOrderCount || 0,
      attemptCount: remote?.attemptCount || 0
    };
  });
}

function summarizePackingBatchOperations(batches = []) {
  const awaitingConfirmation = batches.filter(batch => batch.status === "Awaiting inventory confirmation").length;
  const confirmed = batches.filter(batch => batch.status === "Inventory confirmed").length;
  const inProgressOrReview = batches.filter(batch => batch.status === "Confirmation in progress / review required").length;
  const failed = batches.filter(batch => batch.status === "Confirmation failed — safe to review and retry").length;
  const repeatedBatches = batches.filter(batch => Number(batch.runCount) > 1).length;
  const warnings = [];

  if (inProgressOrReview > 0) warnings.push({
    priority: "HIGH",
    message: `${inProgressOrReview} packing batch confirmation${inProgressOrReview === 1 ? " requires" : "s require"} review before any retry.`
  });
  if (failed > 0) warnings.push({
    priority: "MEDIUM",
    message: `${failed} packing batch confirmation${failed === 1 ? " failed" : "s failed"} before inventory was updated.`
  });
  if (awaitingConfirmation > 0) warnings.push({
    priority: "ACTION",
    message: `${awaitingConfirmation} packing batch${awaitingConfirmation === 1 ? " is" : "es are"} waiting for explicit inventory confirmation.`
  });
  if (repeatedBatches > 0) warnings.push({
    priority: "INFO",
    message: `${repeatedBatches} batch${repeatedBatches === 1 ? " has" : "es have"} been processed more than once; duplicate protection remains active.`
  });

  return {
    totalBatches: batches.length,
    totalRuns: batches.reduce((total, batch) => total + (Number(batch.runCount) || 1), 0),
    awaitingConfirmation,
    confirmed,
    inProgressOrReview,
    failed,
    repeatedBatches,
    warnings,
    recentBatches: batches.slice(0, 5)
  };
}

module.exports = {
  listLocalPackingBatches,
  summarizeSharedBatchRows,
  combinePackingBatchHistory,
  summarizePackingBatchOperations,
  displayStatus
};
