const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const googleInventory = require("./googleInventoryManager");

const RECEIPTS_DIR = path.join(__dirname, "inventory_receipts");

function createReceiptService({ inventoryGateway = googleInventory, receiptsDir = RECEIPTS_DIR } = {}) {
  const confirmationsInProgress = new Set();
  function receiptPath(receiptId) { return path.join(receiptsDir, `${receiptId}.json`); }
  function readReceipt(receiptId) {
    if (!/^[a-f0-9-]{36}$/.test(receiptId)) throw new Error("Invalid receipt ID.");
    const filePath = receiptPath(receiptId);
    if (!fs.existsSync(filePath)) throw new Error("Inventory receipt was not found.");
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  function saveReceipt(receipt) {
    fs.mkdirSync(receiptsDir, { recursive: true });
    fs.writeFileSync(receiptPath(receipt.receiptId), JSON.stringify(receipt, null, 2));
  }

  async function preview({ items, user, reason }) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("Add at least one received item.");
    const inventory = await inventoryGateway.readInventory();
    const byName = new Map(inventory.map(row => [row.item.toLowerCase(), row]));
    const aggregated = new Map();
    for (const entry of items) {
      const item = String(entry.item || "").trim(); const quantity = Number(entry.quantity);
      if (!item || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Every received item needs a valid positive quantity.");
      const current = byName.get(item.toLowerCase());
      if (!current) throw new Error(`Item was not found in Inventory: ${item}`);
      const key = current.item.toLowerCase();
      aggregated.set(key, { item: current.item, quantity: (aggregated.get(key)?.quantity || 0) + quantity, previousQuantity: current.quantity });
    }
    const receiptId = crypto.randomUUID();
    const receivedItems = [...aggregated.values()].map(entry => ({ ...entry, newQuantity: entry.previousQuantity + entry.quantity }));
    const receipt = { receiptId, status: "awaiting_confirmation", createdAt: new Date().toISOString(), user: String(user || "").trim(), reason: String(reason || "Inventory received").trim(), items: receivedItems };
    if (!receipt.user) throw new Error("User is required.");
    saveReceipt(receipt); return receipt;
  }

  async function confirm(receiptId) {
    if (confirmationsInProgress.has(receiptId)) throw new Error("This inventory receipt confirmation is already in progress.");
    const receipt = readReceipt(receiptId);
    if (receipt.status === "confirmed") throw new Error("This inventory receipt was already confirmed.");
    if (receipt.status !== "awaiting_confirmation") throw new Error("This inventory receipt cannot be confirmed.");
    confirmationsInProgress.add(receiptId);
    try {
      const result = await inventoryGateway.addInventory(receipt.items.map(({ item, quantity }) => ({ item, quantity })), { receiptId, user: receipt.user, reason: receipt.reason });
      const confirmed = { ...receipt, status: "confirmed", confirmedAt: new Date().toISOString() };
      saveReceipt(confirmed); return { success: true, receipt: confirmed, updateResult: result };
    } finally {
      confirmationsInProgress.delete(receiptId);
    }
  }

  return { preview, confirm, readReceipt };
}

module.exports = { createReceiptService };
