const crypto = require("crypto");
const { SPREADSHEET_ID, getSheetsClient } = require("./googleInventoryManager");
const { DEFAULT_SCHEMAS } = require("./googleSheetsSchema");

const SHEET_NAME = "Packing Batches";
const HEADERS = DEFAULT_SCHEMAS[SHEET_NAME];

function createGoogleBatchRegistry() {
  async function ensureSheet(sheets) {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" });
    if (!metadata.data.sheets.some(sheet => sheet.properties.title === SHEET_NAME)) {
      try {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] } });
        await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `'${SHEET_NAME}'!A1:G1`, valueInputOption: "RAW", requestBody: { values: [HEADERS] } });
      } catch (error) {
        const retry = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" });
        if (!retry.data.sheets.some(sheet => sheet.properties.title === SHEET_NAME)) throw error;
      }
    }
  }

  async function readRows() {
    const sheets = await getSheetsClient();
    await ensureSheet(sheets);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${SHEET_NAME}'!A2:G` });
    return { sheets, rows: (response.data.values || []).map((row, index) => ({
      rowNumber: index + 2, createdAt: row[0] || "", batchId: row[1] || "", orderKey: row[2] || "",
      status: row[3] || "", user: row[4] || "", attemptId: row[5] || "", updatedAt: row[6] || ""
    })) };
  }

  async function has(batchId) {
    const { rows } = await readRows();
    return rows.some(row => row.batchId === batchId && row.status === "CONFIRMED");
  }

  async function findProcessedOrders(orderKeys) {
    const wanted = new Set(orderKeys || []); const { rows } = await readRows();
    return rows.filter(row => wanted.has(row.orderKey) && row.status === "CONFIRMED").map(row => ({ orderKey: row.orderKey, batchId: row.batchId }));
  }

  async function reserve({ batchId, orderKeys, user }) {
    const sheets = await getSheetsClient(); await ensureSheet(sheets);
    const attemptId = crypto.randomUUID(); const now = new Date().toISOString();
    await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `'${SHEET_NAME}'!A:G`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: orderKeys.map(orderKey => [now, batchId, orderKey, "RESERVED", user || "Unknown user", attemptId, now]) } });

    const current = await readRows();
    const active = current.rows.filter(row => orderKeys.includes(row.orderKey) && ["RESERVED", "CONFIRMED"].includes(row.status));
    const conflicts = orderKeys.map(orderKey => active.find(row => row.orderKey === orderKey)).filter(row => row && row.attemptId !== attemptId);
    if (conflicts.length > 0) {
      await updateAttemptStatus(current.sheets, current.rows, attemptId, "CANCELLED");
      throw new Error(`Inventory was already deducted or reserved for ${new Set(conflicts.map(row => row.orderKey)).size || 1} order(s).`);
    }
    return { attemptId };
  }

  async function updateAttemptStatus(sheets, rows, attemptId, status) {
    const now = new Date().toISOString();
    const data = rows.filter(row => row.attemptId === attemptId).flatMap(row => [
      { range: `'${SHEET_NAME}'!D${row.rowNumber}`, values: [[status]] },
      { range: `'${SHEET_NAME}'!G${row.rowNumber}`, values: [[now]] }
    ]);
    if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: "RAW", data } });
  }

  async function markProcessed(record, reservation) {
    const current = await readRows();
    await updateAttemptStatus(current.sheets, current.rows, reservation.attemptId, "CONFIRMED");
  }

  async function release(reservation) {
    if (!reservation) return;
    const current = await readRows();
    await updateAttemptStatus(current.sheets, current.rows, reservation.attemptId, "FAILED");
  }

  async function listRecords() {
    const { rows } = await readRows();
    return rows;
  }

  async function recoverBatchReservation(batchId, { status, user } = {}) {
    const cleanBatchId = String(batchId || "").trim();
    const cleanStatus = String(status || "").trim().toUpperCase();
    const cleanUser = String(user || "").trim();
    if (!/^[a-f0-9]{64}$/.test(cleanBatchId)) throw new Error("Invalid packing batch ID.");
    if (!["CONFIRMED", "FAILED"].includes(cleanStatus)) throw new Error("Recovery can only confirm or fail a reserved batch.");
    if (!cleanUser) throw new Error("Manager name is required.");
    const current = await readRows();
    const targets = current.rows.filter(row => row.batchId === cleanBatchId && row.status === "RESERVED");
    if (!targets.length) throw new Error("No unresolved shared reservation was found for this batch.");
    const now = new Date().toISOString();
    const data = targets.flatMap(row => [
      { range: `'${SHEET_NAME}'!D${row.rowNumber}:E${row.rowNumber}`, values: [[cleanStatus, cleanUser]] },
      { range: `'${SHEET_NAME}'!G${row.rowNumber}`, values: [[now]] }
    ]);
    await current.sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: "RAW", data } });
    return { batchId: cleanBatchId, status: cleanStatus, rowsUpdated: targets.length, updatedAt: now, user: cleanUser };
  }

  return { has, findProcessedOrders, reserve, markProcessed, release, listRecords, recoverBatchReservation };
}

module.exports = { SHEET_NAME, HEADERS, createGoogleBatchRegistry };
