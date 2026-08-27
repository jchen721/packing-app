const crypto = require("crypto");

function latestHistoryByItem(history = []) {
  const ordered = [...history].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  const latest = new Map();
  for (const row of ordered) {
    const key = String(row.item || "").trim().toLowerCase();
    if (key && !latest.has(key)) latest.set(key, row);
  }
  return latest;
}

function buildInventoryReconciliation(inventory = [], history = []) {
  const latest = latestHistoryByItem(history);
  const rows = [];
  for (const item of inventory) {
    const recorded = latest.get(String(item.item || "").trim().toLowerCase());
    const currentQuantity = Number(item.quantity || 0);
    if (!recorded) {
      rows.push({ item: item.item, category: item.category, previousQuantity: currentQuantity, quantityChanged: 0, newQuantity: currentQuantity, status: "BASELINE_REQUIRED", baseline: true, lastRecordedAt: null });
      continue;
    }
    const recordedQuantity = Number(recorded.newQuantity || 0);
    if (recordedQuantity !== currentQuantity) {
      rows.push({ item: item.item, category: item.category, previousQuantity: recordedQuantity, quantityChanged: currentQuantity - recordedQuantity, newQuantity: currentQuantity, status: "UNRECORDED_SHEET_CHANGE", baseline: false, lastRecordedAt: recorded.timestamp || null });
    }
  }
  return {
    rows,
    unrecordedChanges: rows.filter(row => !row.baseline).length,
    baselinesRequired: rows.filter(row => row.baseline).length,
    ready: rows.length === 0
  };
}

function createInventoryReconciliationService({ inventoryReader, historyReader, sharedLock, historyAppender }) {
  if (!inventoryReader || !historyReader || !sharedLock || !historyAppender) throw new Error("Inventory reconciliation requires inventory, history, lock, and history gateways.");
  async function preview() {
    const [inventory, history] = await Promise.all([inventoryReader(), historyReader(2000)]);
    return { ...buildInventoryReconciliation(inventory, history), refreshedAt: new Date().toISOString() };
  }
  async function confirm(input = {}) {
    const user = String(input.user || "").trim();
    const reason = String(input.reason || "Direct Google Sheets quantity correction").trim();
    if (!user) throw new Error("User is required.");
    if (!reason) throw new Error("Reason is required.");
    const transactionId = crypto.randomUUID();
    return sharedLock({ operation: `INVENTORY_RECONCILIATION:${transactionId}`, user }, async sheets => {
      const current = await preview();
      if (!current.rows.length) return { success: true, transactionId: null, recordsWritten: 0, reconciliation: current };
      const records = current.rows.map(row => ({ item: row.item, category: row.category, previousQuantity: row.previousQuantity, quantityChanged: row.quantityChanged, newQuantity: row.newQuantity, baseline: row.baseline }));
      const saved = await historyAppender(records, { transactionId, user, reason }, sheets);
      return { success: true, ...saved, reconciliation: { ...current, rows: [] } };
    });
  }
  return { preview, confirm };
}

module.exports = { latestHistoryByItem, buildInventoryReconciliation, createInventoryReconciliationService };
