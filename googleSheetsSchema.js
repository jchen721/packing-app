const DEFAULT_SCHEMAS = Object.freeze({
  "Inventory": ["Item", "Quantity", "Low Stock Level", "Reorder Amount"],
  "Warehouse Supplies": ["Item", "Quantity", "Low Stock Level", "Reorder Amount"],
  "packing List": ["ITEM", "QUANTITY", "CHECKLIST"],
  "Packing Batches": ["Created At", "Batch ID", "Order Key", "Status", "User", "Attempt ID", "Updated At"],
  "Packing Activity": ["Timestamp", "Batch ID", "Order ID", "Worker", "Action", "Buyer Nickname", "Packing Group"],
  "Inventory History": ["Timestamp", "Transaction ID", "Item", "Category", "Previous Quantity", "Quantity Changed", "New Quantity", "Action Type", "Reason", "User"],
  "Inventory Locks": ["Created At", "Lock ID", "Operation", "Status", "User", "Updated At", "Error"]
});

const OPERATIONS_SCHEMAS = DEFAULT_SCHEMAS;

const LEGACY_HISTORY_HEADERS = ["Timestamp", "Batch/Receipt ID", "Item", "Previous Quantity", "Quantity Changed", "New Quantity", "Action Type", "Reason", "User"];

function columnLetter(number) {
  let value = number;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function headersEqual(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => normalizeHeader(value) === normalizeHeader(expected[index]));
}

function isSafeTrailingExtension(actual, expected) {
  return actual.length > 0 && actual.length < expected.length && actual.every((value, index) => normalizeHeader(value) === normalizeHeader(expected[index]));
}

function hasExpectedPrefix(actual, expected) {
  return actual.length >= expected.length && expected.every((value, index) => normalizeHeader(actual[index]) === normalizeHeader(value));
}

function migrateLegacyHistoryRows(rows) {
  if (!rows.length || !headersEqual(rows[0], LEGACY_HISTORY_HEADERS)) return null;
  return [DEFAULT_SCHEMAS["Inventory History"], ...rows.slice(1).map(row => [row[0] || "", row[1] || "", row[2] || "", "", row[3] || "", row[4] || "", row[5] || "", row[6] || "", row[7] || "", row[8] || ""])];
}

function createSchemaService({ getSheetsClient, spreadsheetId, schemas = DEFAULT_SCHEMAS, allowTrailingColumns = new Set(["packing List"]) }) {
  async function inspectAll() {
    const sheets = await getSheetsClient();
    const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
    const titles = new Set((metadata.data.sheets || []).map(sheet => sheet.properties.title));
    const results = [];
    for (const [title, headers] of Object.entries(schemas)) {
      if (!titles.has(title)) {
        results.push({ title, status: "missing", ready: false });
        continue;
      }
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${title}'!A1:ZZ1` });
      const actual = response.data.values?.[0] || [];
      if (headersEqual(actual, headers)) results.push({ title, status: "ready", ready: true });
      else if (allowTrailingColumns.has(title) && hasExpectedPrefix(actual, headers)) results.push({ title, status: "ready_with_custom_columns", ready: true, customColumns: actual.slice(headers.length) });
      else if (actual.length === 0) results.push({ title, status: "empty", ready: false });
      else if (isSafeTrailingExtension(actual, headers)) results.push({ title, status: "needs_extension", ready: false });
      else if (title === "Inventory History" && headersEqual(actual, LEGACY_HISTORY_HEADERS)) results.push({ title, status: "needs_migration", ready: false });
      else results.push({ title, status: "incompatible", ready: false });
    }
    return results;
  }

  async function ensureAll() {
    const sheets = await getSheetsClient();
    const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
    const titles = new Set((metadata.data.sheets || []).map(sheet => sheet.properties.title));
    const results = [];

    for (const [title, headers] of Object.entries(schemas)) {
      if (!titles.has(title)) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title } } }] } });
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${title}'!A1:${columnLetter(headers.length)}1`, valueInputOption: "RAW", requestBody: { values: [headers] } });
        results.push({ title, status: "created" });
        continue;
      }

      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${title}'!A1:ZZ` });
      const rows = response.data.values || [];
      const actual = rows[0] || [];
      if (actual.length === 0 || isSafeTrailingExtension(actual, headers)) {
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${title}'!A1:${columnLetter(headers.length)}1`, valueInputOption: "RAW", requestBody: { values: [headers] } });
        results.push({ title, status: actual.length ? "extended" : "initialized" });
      } else if (headersEqual(actual, headers)) {
        results.push({ title, status: "ready" });
      } else if (allowTrailingColumns.has(title) && hasExpectedPrefix(actual, headers)) {
        results.push({ title, status: "ready_with_custom_columns", customColumns: actual.slice(headers.length) });
      } else if (title === "Inventory History") {
        const migrated = migrateLegacyHistoryRows(rows);
        if (!migrated) throw new Error(`Sheet ${title} has incompatible columns and was not modified.`);
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${title}'!A1:J${migrated.length}`, valueInputOption: "RAW", requestBody: { values: migrated } });
        results.push({ title, status: "migrated" });
      } else {
        throw new Error(`Sheet ${title} has incompatible columns and was not modified.`);
      }
    }
    return results;
  }

  return { inspectAll, ensureAll };
}

module.exports = {
  DEFAULT_SCHEMAS,
  OPERATIONS_SCHEMAS,
  LEGACY_HISTORY_HEADERS,
  columnLetter,
  headersEqual,
  isSafeTrailingExtension,
  hasExpectedPrefix,
  migrateLegacyHistoryRows,
  createSchemaService
};
