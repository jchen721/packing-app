const test = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULT_SCHEMAS, OPERATIONS_SCHEMAS } = require("../googleSheetsSchema");
const { SHEET_NAME: BATCH_SHEET, HEADERS: BATCH_HEADERS } = require("../googleBatchRegistry");
const { SHEET_NAME: ACTIVITY_SHEET, HEADERS: ACTIVITY_HEADERS } = require("../googleWorkerTracker");
const { LOCK_SHEET_NAME, LOCK_HEADERS } = require("../googleInventoryManager");
const { SHEET_NAME: PICKING_SHEET, HEADERS: PICKING_HEADERS } = require("../pickingChecklist");

test("only packing and inventory Google Sheet schemas remain active", () => {
  assert.deepEqual(Object.keys(DEFAULT_SCHEMAS).sort(), [
    "Inventory", "Inventory History", "Inventory Locks", "Packing Activity",
    "Packing Batches", "Warehouse Supplies", "packing List"
  ].sort());
  assert.deepEqual(PICKING_HEADERS, DEFAULT_SCHEMAS[PICKING_SHEET]);
  assert.deepEqual(BATCH_HEADERS, DEFAULT_SCHEMAS[BATCH_SHEET]);
  assert.deepEqual(ACTIVITY_HEADERS, DEFAULT_SCHEMAS[ACTIVITY_SHEET]);
  assert.deepEqual(LOCK_HEADERS, DEFAULT_SCHEMAS[LOCK_SHEET_NAME]);
  assert.deepEqual(OPERATIONS_SCHEMAS, DEFAULT_SCHEMAS);
});

test("all active schemas have unique non-empty column names", () => {
  for (const [title, headers] of Object.entries(DEFAULT_SCHEMAS)) {
    assert.ok(headers.length > 0, `${title} must have columns`);
    assert.equal(new Set(headers.map(header => header.toLowerCase())).size, headers.length, `${title} columns must be unique`);
    assert.ok(headers.every(header => String(header).trim()), `${title} columns must be named`);
  }
});
