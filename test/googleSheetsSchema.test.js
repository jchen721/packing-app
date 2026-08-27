const test = require("node:test");
const assert = require("node:assert/strict");
const { createSchemaService, DEFAULT_SCHEMAS, migrateLegacyHistoryRows } = require("../googleSheetsSchema");

function fakeSheets(initial = {}) {
  const state = new Map(Object.entries(initial));
  const writes = [];
  const client = {
    spreadsheets: {
      async get() { return { data: { sheets: [...state.keys()].map(title => ({ properties: { title } })) } }; },
      async batchUpdate({ requestBody }) { const title = requestBody.requests[0].addSheet.properties.title; state.set(title, []); writes.push({ type: "add", title }); },
      values: {
        async get({ range }) { const title = range.match(/^'([^']+)'/)?.[1]; return { data: { values: state.get(title) || [] } }; },
        async update({ range, requestBody }) { const title = range.match(/^'([^']+)'/)?.[1]; const existing = state.get(title) || []; state.set(title, requestBody.values.length === 1 && existing.length > 1 ? [requestBody.values[0], ...existing.slice(1)] : requestBody.values); writes.push({ type: "update", title, values: requestBody.values }); }
      }
    }
  };
  return { client, state, writes };
}

test("schema setup safely creates a missing shared tab", async () => {
  const fake = fakeSheets();
  const service = createSchemaService({ getSheetsClient: async () => fake.client, spreadsheetId: "sheet", schemas: { "Packing Batches": DEFAULT_SCHEMAS["Packing Batches"] } });
  const result = await service.ensureAll();
  assert.deepEqual(result, [{ title: "Packing Batches", status: "created" }]);
  assert.deepEqual(fake.state.get("Packing Batches")[0], DEFAULT_SCHEMAS["Packing Batches"]);
});

test("schema inspection reports readiness without writing", async () => {
  const fake = fakeSheets({ "Packing Batches": [DEFAULT_SCHEMAS["Packing Batches"]] });
  const service = createSchemaService({ getSheetsClient: async () => fake.client, spreadsheetId: "sheet", schemas: { "Packing Batches": DEFAULT_SCHEMAS["Packing Batches"], "Packing Activity": DEFAULT_SCHEMAS["Packing Activity"] } });
  assert.deepEqual(await service.inspectAll(), [
    { title: "Packing Batches", status: "ready", ready: true },
    { title: "Packing Activity", status: "missing", ready: false }
  ]);
  assert.equal(fake.writes.length, 0);
});

test("schema setup refuses incompatible columns without overwriting them", async () => {
  const original = [["Wrong", "Columns"], ["keep", "me"]];
  const fake = fakeSheets({ "Packing Batches": original });
  const service = createSchemaService({ getSheetsClient: async () => fake.client, spreadsheetId: "sheet", schemas: { "Packing Batches": DEFAULT_SCHEMAS["Packing Batches"] } });
  await assert.rejects(service.ensureAll(), /incompatible columns and was not modified/);
  assert.deepEqual(fake.state.get("Packing Batches"), original);
  assert.equal(fake.writes.length, 0);
});

test("legacy inventory history receives the category column without losing rows", () => {
  const rows = [["Timestamp", "Batch/Receipt ID", "Item", "Previous Quantity", "Quantity Changed", "New Quantity", "Action Type", "Reason", "User"], ["2026-08-01", "b1", "ETB", 10, -2, 8, "DEDUCTION", "Packing", "Alice"]];
  const migrated = migrateLegacyHistoryRows(rows);
  assert.deepEqual(migrated[0], DEFAULT_SCHEMAS["Inventory History"]);
  assert.deepEqual(migrated[1], ["2026-08-01", "b1", "ETB", "", 10, -2, 8, "DEDUCTION", "Packing", "Alice"]);
});

test("packing List preserves worker checklist columns after the required system prefix", async () => {
  const rows = [[...DEFAULT_SCHEMAS["packing List"], "Alan", "Maria"], ["ETB", 2, true, false, true]];
  const fake = fakeSheets({ "packing List": rows });
  const service = createSchemaService({ getSheetsClient: async () => fake.client, spreadsheetId: "sheet", schemas: { "packing List": DEFAULT_SCHEMAS["packing List"] } });
  assert.deepEqual(await service.inspectAll(), [{ title: "packing List", status: "ready_with_custom_columns", ready: true, customColumns: ["Alan", "Maria"] }]);
  assert.deepEqual(await service.ensureAll(), [{ title: "packing List", status: "ready_with_custom_columns", customColumns: ["Alan", "Maria"] }]);
  assert.deepEqual(fake.state.get("packing List"), rows);
  assert.equal(fake.writes.length, 0);
});
