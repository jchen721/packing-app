const fs = require("fs");
const path = require("path");

const googleInventory = require("./googleInventoryManager");
const { createGoogleBatchRegistry } = require("./googleBatchRegistry");
const { findBatch, readBatchReview } = require("./batchService");
const { buildInventoryAvailability } = require("./inventoryAvailability");
const config = require("./appConfig");
const { isTrackedPackingSupply } = require("./boxInventoryCatalog");

const OUTPUTS_DIR = path.join(__dirname, "outputs");
const PROCESSED_BATCHES_FILE = path.join(__dirname, "processedBatches.json");

function createLocalBatchRegistry(filePath = PROCESSED_BATCHES_FILE) {
  function readAll() {
    if (!fs.existsSync(filePath)) return [];
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(value)) throw new Error("Processed batch registry is invalid.");
    return value;
  }

  return {
    has(batchId) {
      return readAll().some(batch => batch.batchId === batchId);
    },
    findProcessedOrders(orderKeys) {
      const wanted = new Set(orderKeys || []);
      const matches = [];
      for (const batch of readAll()) {
        const superseded = new Set((batch.supersessions || []).flatMap(entry => entry.orderKeys || []));
        for (const orderKey of batch.orderKeys || []) {
          if (wanted.has(orderKey) && !superseded.has(orderKey)) matches.push({ orderKey, batchId: batch.batchId });
        }
      }
      return matches;
    },
    authorizeCorrectedBatch({ replacementBatchId, orderKeys, user, reason }) {
      const wanted = new Set(orderKeys || []);
      const now = new Date().toISOString();
      let ordersSuperseded = 0;
      const batches = readAll().map(batch => {
        const alreadySuperseded = new Set((batch.supersessions || []).flatMap(entry => entry.orderKeys || []));
        const matches = (batch.orderKeys || []).filter(orderKey => wanted.has(orderKey) && !alreadySuperseded.has(orderKey));
        if (!matches.length) return batch;
        ordersSuperseded += matches.length;
        return {
          ...batch,
          supersessions: [...(batch.supersessions || []), {
            replacementBatchId,
            orderKeys: matches,
            authorizedAt: now,
            authorizedBy: user,
            reason
          }]
        };
      });
      if (ordersSuperseded) fs.writeFileSync(filePath, JSON.stringify(batches, null, 2));
      return { ordersSuperseded };
    },
    markProcessed(record) {
      const batches = readAll();
      if (batches.some(batch => batch.batchId === record.batchId)) {
        throw new Error("This packing batch has already been deducted from inventory.");
      }
      fs.writeFileSync(filePath, JSON.stringify([...batches, record], null, 2));
    }
  };
}

function createConfirmationService({
  inventoryGateway = googleInventory,
  registry = createLocalBatchRegistry(),
  outputsDir = OUTPUTS_DIR,
  selectUsage = usage => usage,
  validateUsage = () => true,
  allowEmptyUsage = false
} = {}) {
  const confirmationsInProgress = new Set();

  async function preview(batchId) {
    const review = readBatchReview(outputsDir, batchId);
    const exactBatchProcessed = await registry.has(batchId);
    const duplicateOrders = registry.findProcessedOrders
      ? await registry.findProcessedOrders(review.orderKeys || [])
      : [];
    const proposedDeductions = selectUsage(review.proposedDeductions);
    let inventoryAvailability = [];
    let inventoryValidationError = null;
    try {
      validateUsage(proposedDeductions);
    } catch (error) {
      inventoryValidationError = error.message;
    }
    if (!inventoryValidationError && typeof inventoryGateway.readInventory === "function") {
      try {
        inventoryAvailability = buildInventoryAvailability(proposedDeductions, await inventoryGateway.readInventory());
      } catch (error) {
        inventoryValidationError = `Current inventory could not be validated. ${error.message}`;
      }
    }
    const inventoryReady = !inventoryValidationError && inventoryAvailability.every(row => row.status === "READY");
    const trackingWarnings = inventoryValidationError && /24-series/.test(inventoryValidationError) ? [inventoryValidationError] : [];
    return { ...review, proposedDeductions, trackingWarnings, duplicateOrders, exactBatchProcessed, alreadyProcessed: exactBatchProcessed || duplicateOrders.length > 0, inventoryAvailability, inventoryReady, inventoryValidationError };
  }

  async function confirm(batchId, metadata = {}) {
    if (confirmationsInProgress.has(batchId)) {
      throw new Error("This packing batch confirmation is already in progress.");
    }
    if (await registry.has(batchId)) {
      throw new Error("This packing batch has already been deducted from inventory.");
    }

    const found = findBatch(outputsDir, batchId);
    if (!found) throw new Error("Packing batch was not found.");
    const review = readBatchReview(outputsDir, batchId);
    const duplicateOrders = registry.findProcessedOrders
      ? await registry.findProcessedOrders(review.orderKeys)
      : [];
    if (duplicateOrders.length > 0) {
      const orderIds = duplicateOrders.map(match => match.orderKey.replace(/^order:/, "")).join(", ");
      throw new Error(`Inventory was already deducted for ${duplicateOrders.length} order(s): ${orderIds}`);
    }
    const fullUsage = JSON.parse(fs.readFileSync(path.join(found.runDir, "inventory_usage.json"), "utf8"));
    const usage = selectUsage(fullUsage);
    if (!Array.isArray(usage) || (!allowEmptyUsage && usage.length === 0)) throw new Error("No inventory usage was found.");
    validateUsage(usage);

    confirmationsInProgress.add(batchId);
    let reservation;
    let inventoryUpdated = false;
    try {
      if (registry.reserve) {
        reservation = await registry.reserve({ batchId, orderKeys: review.orderKeys, user: metadata.user });
      }
      const updateResult = usage.length
        ? await inventoryGateway.subtractInventory(usage, {
          batchId,
          user: metadata.user,
          reason: metadata.reason || "Confirmed packing batch"
        })
        : { success: true, itemsUpdated: 0 };
      inventoryUpdated = usage.length > 0;

      const processedAt = new Date().toISOString();
      try {
        await registry.markProcessed({ batchId, orderKeys: review.orderKeys, processedAt, user: metadata.user || "Unknown user", itemsDeducted: usage }, reservation);
      } catch (error) {
        const prefix = usage.length
          ? "Inventory was updated, but the shared batch record could not be finalized. Do not retry this batch; manual review is required."
          : "No inventory change was needed, but the shared batch record could not be finalized.";
        throw new Error(`${prefix} ${error.message}`);
      }

      const completedBatch = { ...found.batch, status: "inventory_confirmed", confirmedAt: processedAt, confirmedBy: metadata.user || "Unknown user" };
      fs.writeFileSync(path.join(found.runDir, "batch.json"), JSON.stringify(completedBatch, null, 2));

      return { success: true, batchId, processedAt, itemsDeducted: usage, updateResult };
    } catch (error) {
      if (reservation && !inventoryUpdated && registry.release) {
        try { await registry.release(reservation); } catch (releaseError) {
          throw new Error(`${error.message} Shared reservation cleanup also failed: ${releaseError.message}`);
        }
      }
      throw error;
    } finally {
      confirmationsInProgress.delete(batchId);
    }
  }

  async function authorizeCorrection(batchId, metadata = {}) {
    const user = String(metadata.user || "").trim();
    if (!user) throw new Error("Manager name is required.");
    if (metadata.inventoryRestored !== true) throw new Error("Confirm that the earlier inventory quantities were restored before authorizing a corrected rerun.");
    if (await registry.has(batchId)) throw new Error("This exact packing batch was already deducted and cannot be authorized as a corrected rerun.");
    if (typeof registry.authorizeCorrectedBatch !== "function") throw new Error("Corrected rerun authorization is unavailable.");

    const review = readBatchReview(outputsDir, batchId);
    const duplicates = registry.findProcessedOrders
      ? await registry.findProcessedOrders(review.orderKeys || [])
      : [];
    const orderKeys = [...new Set(duplicates.map(match => match.orderKey))];
    if (!orderKeys.length) throw new Error("This batch has no earlier confirmed orders requiring correction authorization.");
    const reason = String(metadata.reason || "Earlier inventory restored before corrected packing rerun").trim();
    const result = await registry.authorizeCorrectedBatch({ replacementBatchId: batchId, orderKeys, user, reason });
    return { success: true, batchId, ordersAuthorized: orderKeys.length, authorizedAt: new Date().toISOString(), user, ...result };
  }

  return { preview, confirm, authorizeCorrection };
}

function createHybridRegistry(shared = createGoogleBatchRegistry(), local = createLocalBatchRegistry()) {
  return {
    async has(batchId) { return await shared.has(batchId) || local.has(batchId); },
    async findProcessedOrders(orderKeys) {
      const combined = [...await shared.findProcessedOrders(orderKeys), ...local.findProcessedOrders(orderKeys)];
      return [...new Map(combined.map(match => [`${match.orderKey}:${match.batchId}`, match])).values()];
    },
    reserve(record) { return shared.reserve(record); },
    async markProcessed(record, reservation) {
      await shared.markProcessed(record, reservation);
      try { local.markProcessed(record); } catch (error) { console.error("Shared batch confirmed, but local audit backup failed:", error.message); }
    },
    async authorizeCorrectedBatch(record) {
      const localResult = local.authorizeCorrectedBatch(record);
      const sharedResult = await shared.authorizeCorrectedBatch(record);
      return { localOrdersSuperseded: localResult.ordersSuperseded, sharedOrdersSuperseded: sharedResult.ordersSuperseded };
    },
    release(reservation) { return shared.release(reservation); }
  };
}

function selectTrackedInventoryUsage(usage, scope = "boxes") {
  if (!Array.isArray(usage)) return [];
  return scope === "all" ? usage : usage.filter(entry => isTrackedPackingSupply(entry.item) || String(entry.item || "").trim() === "24 Boxes");
}

function validateResolvedBoxUsage(usage) {
  if ((usage || []).some(entry => String(entry.item || "").trim() === "24 Boxes")) {
    throw new Error("This batch contains a 24-series box. Confirm whether it uses 24x12x4 or 24x12x6 before inventory can be deducted.");
  }
  return true;
}

const defaultService = createConfirmationService({
  registry: createHybridRegistry(),
  selectUsage: usage => selectTrackedInventoryUsage(usage, config.inventoryTrackingScope),
  validateUsage: config.inventoryTrackingScope === "boxes" ? validateResolvedBoxUsage : () => true,
  allowEmptyUsage: config.inventoryTrackingScope === "boxes"
});

module.exports = {
  createLocalBatchRegistry,
  createHybridRegistry,
  createConfirmationService,
  selectTrackedInventoryUsage,
  validateResolvedBoxUsage,
  previewDailyInventoryUpdate: batchId => defaultService.preview(batchId),
  confirmDailyInventoryUpdate: (batchId, metadata) => defaultService.confirm(batchId, metadata),
  authorizeCorrectedInventoryBatch: (batchId, metadata) => defaultService.authorizeCorrection(batchId, metadata)
};
