const crypto = require("crypto");
const { google } = require("googleapis");
const config = require("./appConfig");
const { DEFAULT_SCHEMAS, createSchemaService } = require("./googleSheetsSchema");
const { buildInventoryAvailability, assertInventoryAvailability } = require("./inventoryAvailability");
const { BOX_INVENTORY_SHEET_NAME, canonicalTrackedPackingSupplyName } = require("./boxInventoryCatalog");

// CHANGE these two values.
const SPREADSHEET_ID = config.spreadsheetId;
const CREDENTIALS_FILE = config.credentialsFile;

const INVENTORY_SHEET_NAME = "Inventory";
const SUPPLIES_SHEET_NAME = "Warehouse Supplies";
const HISTORY_SHEET_NAME = "Inventory History";
const HISTORY_HEADERS = DEFAULT_SCHEMAS[HISTORY_SHEET_NAME];
const LOCK_SHEET_NAME = "Inventory Locks";
const LOCK_HEADERS = DEFAULT_SCHEMAS[LOCK_SHEET_NAME];

const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_FILE,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function getSheetsClient() {
  return google.sheets({
    version: "v4",
    auth: await auth.getClient(),
  });
}

const inventorySchemaService = createSchemaService({
  getSheetsClient,
  spreadsheetId: SPREADSHEET_ID,
  schemas: {
    [INVENTORY_SHEET_NAME]: DEFAULT_SCHEMAS[INVENTORY_SHEET_NAME],
    [BOX_INVENTORY_SHEET_NAME]: DEFAULT_SCHEMAS[BOX_INVENTORY_SHEET_NAME],
    [HISTORY_SHEET_NAME]: DEFAULT_SCHEMAS[HISTORY_SHEET_NAME]
  }
});

let inventorySchemasReady;
async function ensureInventorySchemas() {
  if (!inventorySchemasReady) inventorySchemasReady = inventorySchemaService.ensureAll().catch(error => { inventorySchemasReady = null; throw error; });
  return inventorySchemasReady;
}

async function ensureHistorySheet(sheets) {
  await ensureInventorySchemas();
}

async function hasSheet(sheets, title) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" });
  return metadata.data.sheets.some(sheet => sheet.properties.title === title);
}

async function ensureLockSheet(sheets) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" });
  if (metadata.data.sheets.some(sheet => sheet.properties.title === LOCK_SHEET_NAME)) return;
  try {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: LOCK_SHEET_NAME } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `'${LOCK_SHEET_NAME}'!A1:G1`, valueInputOption: "RAW", requestBody: { values: [LOCK_HEADERS] } });
  } catch (error) {
    const retry = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" });
    if (!retry.data.sheets.some(sheet => sheet.properties.title === LOCK_SHEET_NAME)) throw error;
  }
}

function selectInventoryLockWinner(rows) {
  return rows.find(row => ["ACTIVE", "NEEDS_REVIEW"].includes(String(row[3] || ""))) || null;
}

function rowsToInventoryLocks(rows = []) {
  return rows.filter(row => row[1]).map(row => ({
    createdAt: row[0] || "", lockId: row[1] || "", operation: row[2] || "", status: row[3] || "",
    user: row[4] || "", updatedAt: row[5] || "", error: row[6] || ""
  }));
}

async function readLockRows(sheets) {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${LOCK_SHEET_NAME}'!A2:G` });
  return (response.data.values || []).map((row, index) => ({ row, rowNumber: index + 2 }));
}

async function readInventoryLocks(limit = 100) {
  const sheets = await getSheetsClient();
  if (!await hasSheet(sheets, LOCK_SHEET_NAME)) return [];
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${LOCK_SHEET_NAME}'!A2:G` });
  return rowsToInventoryLocks(response.data.values || []).reverse().slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)));
}

async function resolveInventoryLockRecord(lockId, metadata = {}) {
  const cleanLockId = String(lockId || "").trim();
  const user = String(metadata.user || "").trim();
  const reason = String(metadata.reason || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(cleanLockId)) throw new Error("Invalid shared operation lock ID.");
  if (!user || reason.length < 8) throw new Error("Manager name and a clear recovery reason are required.");
  const sheets = await getSheetsClient();
  await ensureLockSheet(sheets);
  const match = (await readLockRows(sheets)).find(entry => entry.row[1] === cleanLockId);
  if (!match) throw new Error("Shared operation lock was not found.");
  const status = String(match.row[3] || "").toUpperCase();
  if (!["ACTIVE", "NEEDS_REVIEW"].includes(status)) throw new Error(`This shared operation lock is already ${status || "closed"}.`);
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: "RAW", data: [
    { range: `'${LOCK_SHEET_NAME}'!D${match.rowNumber}`, values: [["RESOLVED"]] },
    { range: `'${LOCK_SHEET_NAME}'!F${match.rowNumber}:G${match.rowNumber}`, values: [[now, `Resolved by ${user}: ${reason}`]] }
  ] } });
  return { lockId: cleanLockId, previousStatus: status, status: "RESOLVED", resolvedAt: now, resolvedBy: user, reason };
}

async function updateLock(sheets, lockId, status, error = "") {
  const match = (await readLockRows(sheets)).find(entry => entry.row[1] === lockId);
  if (!match) throw new Error("Shared inventory lock record was not found.");
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: "RAW", data: [
    { range: `'${LOCK_SHEET_NAME}'!D${match.rowNumber}`, values: [[status]] },
    { range: `'${LOCK_SHEET_NAME}'!F${match.rowNumber}:G${match.rowNumber}`, values: [[new Date().toISOString(), error]] }
  ] } });
}

async function acquireInventoryLock(sheets, operation, user) {
  await ensureLockSheet(sheets); const lockId = crypto.randomUUID(); const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `'${LOCK_SHEET_NAME}'!A:G`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [[now, lockId, operation, "ACTIVE", user || "Unknown user", now, ""]] } });
  const rows = (await readLockRows(sheets)).map(entry => entry.row);
  const winner = selectInventoryLockWinner(rows);
  if (!winner || winner[1] !== lockId) {
    await updateLock(sheets, lockId, "CANCELLED", "Another inventory operation already owns the shared lock.");
    throw new Error("Another inventory update is already in progress or requires manual review. Try again after it is resolved.");
  }
  return lockId;
}

async function withInventoryLock(metadata, task) {
  const sheets = await getSheetsClient(); await ensureHistorySheet(sheets);
  const lockId = await acquireInventoryLock(sheets, metadata.operation, metadata.user);
  try {
    const result = await task(sheets);
    try { await updateLock(sheets, lockId, "COMPLETED"); }
    catch (error) { throw new Error(`Inventory changed, but the shared operation lock could not be finalized. Manual review is required. ${error.message}`); }
    return result;
  } catch (error) {
    if (!/Inventory changed, but/.test(error.message)) {
      const status = /Manual reconciliation is required/.test(error.message) ? "NEEDS_REVIEW" : "FAILED";
      try { await updateLock(sheets, lockId, status, error.message); }
      catch (lockError) { throw new Error(`${error.message} The shared inventory lock also could not be updated: ${lockError.message}`); }
    }
    throw error;
  }
}

/**
 * Reads the Inventory tab.
 *
 * Expected columns:
 * A: Item
 * B: Quantity
 * C: Low Stock Level
 * D: Reorder Amount
 */
async function readInventory() {
  const sheets = await getSheetsClient();
  const sources = [
    { sheetName: INVENTORY_SHEET_NAME, category: "Pokémon Products" },
    { sheetName: BOX_INVENTORY_SHEET_NAME, category: "Warehouse Supplies", boxInventory: true }
  ];
  const responses = await Promise.all(sources.map(source => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${source.sheetName}'!A2:J` })));
  const loadedInventory = sources.flatMap((source, sourceIndex) => (responses[sourceIndex].data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(entry => entry.row[0])
    .map(({ row, rowNumber }) => {
      const rawQuantity = String(row[1] ?? "").trim();
      const numericQuantity = Number(rawQuantity);
      const quantityVerified = !source.boxInventory || (rawQuantity !== "" && Number.isFinite(numericQuantity) && numericQuantity >= 0);
      return {
        sheetName: source.sheetName,
        rowNumber,
        item: String(row[0]).trim(),
        quantity: quantityVerified ? Number(row[1] || 0) : null,
        quantityVerified,
        lowStockLevel: Number(row[2] || 0),
        reorderAmount: Number(row[3] || 0),
        category: source.category
      };
    }));
  const boxInventoryNames = new Set(loadedInventory
    .filter(row => row.sheetName === BOX_INVENTORY_SHEET_NAME)
    .map(row => canonicalTrackedPackingSupplyName(row.item))
    .filter(Boolean));
  // Preserve legacy supply rows in Inventory, but use Box Inventory as the one
  // operational source of truth when the same tracked supply exists there.
  const inventory = loadedInventory.filter(row => row.sheetName === BOX_INVENTORY_SHEET_NAME ||
    !boxInventoryNames.has(canonicalTrackedPackingSupplyName(row.item)));
  const seen = new Set();
  const duplicates = [];
  for (const row of inventory) {
    const key = row.item.toLowerCase();
    if (seen.has(key)) duplicates.push(row.item); else seen.add(key);
  }
  if (duplicates.length) throw new Error(`Inventory item names must be unique across Inventory and Box Inventory: ${[...new Set(duplicates)].join(", ")}`);
  return inventory;
  }

async function readInventoryHistory(limit = 500) {
  const sheets = await getSheetsClient();
  if (!await hasSheet(sheets, HISTORY_SHEET_NAME)) return [];
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${HISTORY_SHEET_NAME}'!A2:J`,
  });
  const rows = response.data.values || [];
  return rows.map(row => ({
    timestamp: row[0] || "", batchId: row[1] || "", item: row[2] || "", category: row[3] || "",
    previousQuantity: Number(row[4] || 0), quantityChanged: Number(row[5] || 0),
    newQuantity: Number(row[6] || 0), actionType: row[7] || "",
    reason: row[8] || "", user: row[9] || ""
  })).reverse().slice(0, Math.max(1, Math.min(Number(limit) || 500, 2000)));
}

async function readInventoryHistoryByTransactionId(transactionId) {
  const wanted = String(transactionId || "").trim();
  if (!wanted) throw new Error("Transaction ID is required.");
  const sheets = await getSheetsClient();
  if (!await hasSheet(sheets, HISTORY_SHEET_NAME)) return [];
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${HISTORY_SHEET_NAME}'!A2:J` });
  return (response.data.values || []).filter(row => String(row[1] || "").trim() === wanted).map(row => ({
    timestamp: row[0] || "", batchId: row[1] || "", item: row[2] || "", category: row[3] || "",
    previousQuantity: Number(row[4] || 0), quantityChanged: Number(row[5] || 0),
    newQuantity: Number(row[6] || 0), actionType: row[7] || "", reason: row[8] || "", user: row[9] || ""
  }));
}

function historyContainsOperationId(rows, operationId) {
  const wanted = String(operationId || "").trim();
  return Boolean(wanted) && rows.some(row => String(row[0] || "").trim() === wanted);
}

async function hasHistoryOperationId(sheets, operationId) {
  if (!operationId) return false;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${HISTORY_SHEET_NAME}!B2:B` });
  return historyContainsOperationId(response.data.values || [], operationId);
}

/**
 * Subtracts packing usage from the Inventory tab.
 *
 * usage example:
 * [
 *   { item: "Chaos Rising ETB", quantity: 10 },
 *   { item: "8x8x4 Boxes", quantity: 5 }
 * ]
 */
async function subtractInventoryUnlocked(usage, metadata, sheets) {
  if (!Array.isArray(usage) || usage.length === 0) {
    throw new Error("No inventory usage was supplied.");
  }

  const inventory = await readInventory();
  const inventoryMap = new Map();

  for (const inventoryItem of inventory) {
    inventoryMap.set(
      inventoryItem.item.toLowerCase(),
      inventoryItem
    );
  }

  assertInventoryAvailability(buildInventoryAvailability(usage, inventory));

  const updates = [];
  const rollbackUpdates = [];
  const historyRows = [];
  const changes = [];
  const missingItems = [];

  for (const usedItem of usage) {
    const itemName = String(usedItem.item || "").trim();
    const quantityUsed = Number(usedItem.quantity);

    if (
      !itemName ||
      !Number.isFinite(quantityUsed) ||
      quantityUsed <= 0
    ) {
      continue;
    }

    const inventoryItem = inventoryMap.get(itemName.toLowerCase());

    if (!inventoryItem) {
      missingItems.push(itemName);
      continue;
    }

    const previousQuantity = inventoryItem.quantity;
    const newQuantity = previousQuantity - quantityUsed;

    updates.push({
      range: `'${inventoryItem.sheetName}'!B${inventoryItem.rowNumber}`,
      values: [[newQuantity]],
    });

    rollbackUpdates.push({
      range: `'${inventoryItem.sheetName}'!B${inventoryItem.rowNumber}`,
      values: [[previousQuantity]],
    });

    historyRows.push([
      new Date().toISOString(),
      String(metadata.batchId || ""),
      itemName,
      inventoryItem.category,
      previousQuantity,
      -quantityUsed,
      newQuantity,
      "DEDUCTION",
      String(metadata.reason || "Packing usage"),
      String(metadata.user || "Unknown user"),
    ]);
    changes.push({
      item: itemName,
      category: inventoryItem.category,
      previousQuantity,
      quantityChanged: -quantityUsed,
      newQuantity,
      lowStockLevel: inventoryItem.lowStockLevel,
      reorderAmount: inventoryItem.reorderAmount
    });
  }

  if (missingItems.length > 0) {
    throw new Error(
      `These items were not found in Inventory or Box Inventory: ${missingItems.join(
        ", "
      )}`
    );
  }

  if (updates.length === 0) {
    throw new Error("No valid inventory deductions were found.");
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates,
    },
  });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${HISTORY_SHEET_NAME}'!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: historyRows,
      },
    });
  } catch (historyError) {
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: rollbackUpdates,
        },
      });
    } catch (rollbackError) {
      throw new Error(
        `Inventory history failed and inventory rollback also failed. Manual reconciliation is required. History error: ${historyError.message}; rollback error: ${rollbackError.message}`
      );
    }
    throw new Error(`Inventory history failed; inventory quantities were restored. ${historyError.message}`);
  }

  return {
    success: true,
    itemsUpdated: updates.length,
    changes
  };
}

/**
 * Adds newly received inventory without running the packing process.
 */
async function addInventoryUnlocked(receivedItems, metadata, sheets) {
  if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
    throw new Error("No received inventory was supplied.");
  }

  if (metadata.receiptId && await hasHistoryOperationId(sheets, metadata.receiptId)) {
    throw new Error("This inventory receipt was already recorded in shared Inventory History.");
  }
  const inventory = await readInventory();
  const inventoryMap = new Map();

  for (const inventoryItem of inventory) {
    inventoryMap.set(
      inventoryItem.item.toLowerCase(),
      inventoryItem
    );
  }

  const updates = [];
  const rollbackUpdates = [];
  const historyRows = [];
  const missingItems = [];

  for (const receivedItem of receivedItems) {
    const itemName = String(receivedItem.item || "").trim();
    const quantityReceived = Number(receivedItem.quantity);

    if (
      !itemName ||
      !Number.isFinite(quantityReceived) ||
      quantityReceived <= 0
    ) {
      continue;
    }

    const inventoryItem = inventoryMap.get(itemName.toLowerCase());

    if (!inventoryItem) {
      missingItems.push(itemName);
      continue;
    }

    const newQuantity =
      inventoryItem.quantity + quantityReceived;

    updates.push({
      range: `'${inventoryItem.sheetName}'!B${inventoryItem.rowNumber}`,
      values: [[newQuantity]],
    });

    rollbackUpdates.push({
      range: `'${inventoryItem.sheetName}'!B${inventoryItem.rowNumber}`,
      values: [[inventoryItem.quantity]],
    });

    historyRows.push([
      new Date().toISOString(),
      String(metadata.receiptId || ""),
      itemName,
      inventoryItem.category,
      inventoryItem.quantity,
      quantityReceived,
      newQuantity,
      "RECEIVED",
      String(metadata.reason || "Inventory received"),
      String(metadata.user || "Unknown user"),
    ]);
  }

  if (missingItems.length > 0) {
    throw new Error(
      `These items were not found in Inventory or Box Inventory: ${missingItems.join(
        ", "
      )}`
    );
  }

  if (updates.length === 0) {
    throw new Error("No valid received inventory was found.");
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates,
    },
  });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${HISTORY_SHEET_NAME}'!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: historyRows },
    });
  } catch (historyError) {
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: "USER_ENTERED", data: rollbackUpdates },
      });
    } catch (rollbackError) {
      throw new Error(`Receipt history failed and inventory rollback also failed. Manual reconciliation is required. History error: ${historyError.message}; rollback error: ${rollbackError.message}`);
    }
    throw new Error(`Receipt history failed; inventory quantities were restored. ${historyError.message}`);
  }

  return {
    success: true,
    itemsUpdated: updates.length,
  };
}

async function subtractInventory(usage, metadata = {}) {
  if (!Array.isArray(usage) || usage.length === 0) throw new Error("No inventory usage was supplied.");
  return withInventoryLock({ operation: `DEDUCTION:${metadata.batchId || "manual"}`, user: metadata.user }, sheets => subtractInventoryUnlocked(usage, metadata, sheets));
}

async function addInventory(receivedItems, metadata = {}) {
  if (!Array.isArray(receivedItems) || receivedItems.length === 0) throw new Error("No received inventory was supplied.");
  return withInventoryLock({ operation: `RECEIPT:${metadata.receiptId || "manual"}`, user: metadata.user }, sheets => addInventoryUnlocked(receivedItems, metadata, sheets));
}

function reversalTransactionId(sourceTransactionId) {
  const source = String(sourceTransactionId || "").trim();
  if (!source || source.length > 200 || source.startsWith("reversal:")) throw new Error("Choose a valid original inventory transaction.");
  return `reversal:${source}`;
}

function buildInventoryReversal(sourceTransactionId, sourceRows, inventory) {
  const reversalId = reversalTransactionId(sourceTransactionId);
  if (!Array.isArray(sourceRows) || sourceRows.length === 0) throw new Error("The original inventory transaction was not found.");
  const unsupported = [...new Set(sourceRows.map(row => String(row.actionType || "").toUpperCase()).filter(type => !["DEDUCTION", "RECEIVED"].includes(type)))];
  if (unsupported.length) throw new Error(`Only deduction or received transactions can be reversed. This transaction contains: ${unsupported.join(", ")}.`);
  const inventoryMap = new Map((inventory || []).map(row => [String(row.item || "").trim().toLowerCase(), row]));
  const grouped = new Map();
  for (const row of sourceRows) {
    const key = String(row.item || "").trim().toLowerCase();
    if (!key || !Number.isFinite(Number(row.quantityChanged))) throw new Error("The original transaction contains invalid inventory history.");
    const current = grouped.get(key) || { item: String(row.item).trim(), category: row.category, originalChange: 0 };
    current.originalChange += Number(row.quantityChanged);
    grouped.set(key, current);
  }
  const changes = [...grouped.values()].map(change => {
    const current = inventoryMap.get(change.item.toLowerCase());
    if (!current || current.quantityVerified === false || !Number.isFinite(Number(current.quantity))) throw new Error(`${change.item} is missing or does not have a verified current quantity.`);
    const quantityChanged = -change.originalChange;
    const previousQuantity = Number(current.quantity);
    const newQuantity = previousQuantity + quantityChanged;
    if (newQuantity < 0) throw new Error(`Reversing this transaction would make ${change.item} negative (${newQuantity}). Correct the stock or reverse a newer transaction first.`);
    return { item: current.item, category: current.category, sheetName: current.sheetName, rowNumber: current.rowNumber, previousQuantity, quantityChanged, newQuantity };
  });
  if (!changes.length || changes.every(change => change.quantityChanged === 0)) throw new Error("The original transaction has no reversible quantity change.");
  return { sourceTransactionId: String(sourceTransactionId).trim(), reversalTransactionId: reversalId, changes };
}

async function previewInventoryReversal(sourceTransactionId) {
  const reversalId = reversalTransactionId(sourceTransactionId);
  const [sourceRows, existingReversal, inventory] = await Promise.all([
    readInventoryHistoryByTransactionId(sourceTransactionId),
    readInventoryHistoryByTransactionId(reversalId),
    readInventory()
  ]);
  if (existingReversal.length) throw new Error("This inventory transaction has already been reversed.");
  return buildInventoryReversal(sourceTransactionId, sourceRows, inventory);
}

async function reverseInventoryTransaction(input = {}) {
  const sourceTransactionId = String(input.transactionId || "").trim();
  const user = String(input.user || "").trim();
  const reason = String(input.reason || "").trim();
  const reversalId = reversalTransactionId(sourceTransactionId);
  if (!user) throw new Error("Manager name is required.");
  if (reason.length < 5) throw new Error("Enter a clear reason for the reversal.");
  return withInventoryLock({ operation: `REVERSAL:${sourceTransactionId}`, user }, async sheets => {
    const [sourceRows, existingReversal, inventory] = await Promise.all([
      readInventoryHistoryByTransactionId(sourceTransactionId),
      readInventoryHistoryByTransactionId(reversalId),
      readInventory()
    ]);
    if (existingReversal.length) throw new Error("This inventory transaction has already been reversed.");
    const preview = buildInventoryReversal(sourceTransactionId, sourceRows, inventory);
    const updates = preview.changes.map(change => ({ range: `'${change.sheetName}'!B${change.rowNumber}`, values: [[change.newQuantity]] }));
    const rollbackUpdates = preview.changes.map(change => ({ range: `'${change.sheetName}'!B${change.rowNumber}`, values: [[change.previousQuantity]] }));
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data: updates } });
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${HISTORY_SHEET_NAME}'!A:J`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: preview.changes.map(change => [
          new Date().toISOString(), reversalId, change.item, change.category,
          change.previousQuantity, change.quantityChanged, change.newQuantity,
          "REVERSAL", `Reversal of ${sourceTransactionId}: ${reason}`, user
        ]) }
      });
    } catch (historyError) {
      try {
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data: rollbackUpdates } });
      } catch (rollbackError) {
        throw new Error(`Reversal history failed and inventory rollback also failed. Manual reconciliation is required. History error: ${historyError.message}; rollback error: ${rollbackError.message}`);
      }
      throw new Error(`Reversal history failed; inventory quantities were restored. ${historyError.message}`);
    }
    return { success: true, ...preview, user, reason };
  });
}

function normalizeCatalogInput(input) {
  const item = String(input.item || "").trim(); const quantity = Number(input.quantity || 0);
  const lowStockLevel = Number(input.lowStockLevel || 0); const reorderAmount = Number(input.reorderAmount || 0);
  const category = String(input.category || "").trim(); const user = String(input.user || "").trim(); const reason = String(input.reason || "New inventory item").trim();
  if (!item) throw new Error("Item name is required.");
  for (const [label, value] of [["Starting quantity", quantity], ["Low-stock level", lowStockLevel], ["Reorder amount", reorderAmount]]) if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a valid non-negative number.`);
  if (!["Pokémon Products", "Warehouse Supplies"].includes(category)) throw new Error("Choose Pokémon Products or Warehouse Supplies.");
  if (!user) throw new Error("User is required.");
  return { item, quantity, lowStockLevel, reorderAmount, category, user, reason };
}

function inventorySheetForCategory(category) {
  return category === "Warehouse Supplies" ? SUPPLIES_SHEET_NAME : INVENTORY_SHEET_NAME;
}

async function addInventoryItem(input) {
  const item = normalizeCatalogInput(input); const catalogId = crypto.randomUUID();
  return withInventoryLock({ operation: `CATALOG_CREATE:${catalogId}`, user: item.user }, async sheets => {
    const inventory = await readInventory();
    if (inventory.some(existing => existing.item.toLowerCase() === item.item.toLowerCase())) throw new Error("This inventory item already exists.");
    const sheetName = inventorySheetForCategory(item.category);
    const append = await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `'${sheetName}'!A:D`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [[item.item, item.quantity, item.lowStockLevel, item.reorderAmount]] } });
    const updatedRange = append.data.updates?.updatedRange;
    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `'${HISTORY_SHEET_NAME}'!A:J`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [[new Date().toISOString(), catalogId, item.item, item.category, 0, item.quantity, item.quantity, "RECEIVED", item.reason, item.user]] } });
    } catch (error) {
      if (updatedRange) await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: updatedRange });
      throw new Error(`New item history failed; the catalog row was removed. ${error.message}`);
    }
    return { success: true, catalogId, item };
  });
}

async function updateInventorySettings(itemName, input) {
  const item = String(itemName || "").trim(); const lowStockLevel = Number(input.lowStockLevel); const reorderAmount = Number(input.reorderAmount);
  const category = String(input.category || "").trim(); const user = String(input.user || "").trim();
  if (!item || !Number.isFinite(lowStockLevel) || lowStockLevel < 0 || !Number.isFinite(reorderAmount) || reorderAmount < 0) throw new Error("Valid item, low-stock level, and reorder amount are required.");
  if (!["Pokémon Products", "Warehouse Supplies"].includes(category)) throw new Error("Choose a valid inventory category.");
  if (!user) throw new Error("User is required.");
  return withInventoryLock({ operation: `SETTINGS:${item}`, user }, async sheets => {
    const inventory = await readInventory(); const existing = inventory.find(row => row.item.toLowerCase() === item.toLowerCase());
    if (!existing) throw new Error("Inventory item was not found.");
    const targetSheet = inventorySheetForCategory(category);
    if (targetSheet === existing.sheetName) {
      await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `'${existing.sheetName}'!C${existing.rowNumber}:D${existing.rowNumber}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[lowStockLevel, reorderAmount]] } });
    } else {
      const append = await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `'${targetSheet}'!A:D`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [[existing.item, existing.quantity, lowStockLevel, reorderAmount]] } });
      try {
        await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `'${existing.sheetName}'!A${existing.rowNumber}:D${existing.rowNumber}` });
      } catch (error) {
        if (append.data.updates?.updatedRange) await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: append.data.updates.updatedRange });
        throw new Error(`Inventory category move failed and was rolled back. ${error.message}`);
      }
    }
    return { success: true, item: existing.item, lowStockLevel, reorderAmount, category };
  });
}

async function appendInventoryReconciliationHistory(records, metadata, sheets) {
  if (!sheets) throw new Error("A locked Google Sheets client is required for inventory reconciliation.");
  if (!Array.isArray(records) || records.length === 0) throw new Error("No inventory reconciliation records were supplied.");
  const transactionId = String(metadata.transactionId || "").trim();
  const user = String(metadata.user || "").trim();
  const reason = String(metadata.reason || "Direct Google Sheets quantity correction").trim();
  if (!transactionId || !user) throw new Error("Inventory reconciliation requires a transaction ID and user.");
  const values = records.map(record => {
    const item = String(record.item || "").trim();
    const category = String(record.category || "").trim();
    const previousQuantity = Number(record.previousQuantity);
    const quantityChanged = Number(record.quantityChanged);
    const newQuantity = Number(record.newQuantity);
    if (!item || ![previousQuantity, quantityChanged, newQuantity].every(Number.isFinite) || previousQuantity + quantityChanged !== newQuantity) throw new Error(`Invalid inventory reconciliation record for ${item || "(blank item)"}.`);
    return [new Date().toISOString(), transactionId, item, category, previousQuantity, quantityChanged, newQuantity, "CORRECTION", record.baseline ? `${reason} (history baseline)` : reason, user];
  });
  await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `'${HISTORY_SHEET_NAME}'!A:J`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values } });
  return { transactionId, recordsWritten: values.length };
}

module.exports = {
  SPREADSHEET_ID,
  INVENTORY_SHEET_NAME,
  SUPPLIES_SHEET_NAME,
  HISTORY_SHEET_NAME,
  LOCK_SHEET_NAME,
  LOCK_HEADERS,
  getSheetsClient,
  ensureLockSheet,
  ensureInventorySchemas,
  readInventory,
  readInventoryHistory,
  readInventoryHistoryByTransactionId,
  historyContainsOperationId,
  selectInventoryLockWinner,
  rowsToInventoryLocks,
  readInventoryLocks,
  resolveInventoryLockRecord,
  normalizeCatalogInput,
  inventorySheetForCategory,
  withInventoryLock,
  subtractInventory,
  addInventory,
  reversalTransactionId,
  buildInventoryReversal,
  previewInventoryReversal,
  reverseInventoryTransaction,
  addInventoryItem,
  updateInventorySettings,
  appendInventoryReconciliationHistory,
};
