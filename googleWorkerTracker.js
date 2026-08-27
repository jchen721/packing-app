const { SPREADSHEET_ID, getSheetsClient } = require("./googleInventoryManager");
const { validateWorkerLog } = require("./workerTracker");
const { DEFAULT_SCHEMAS } = require("./googleSheetsSchema");

const SHEET_NAME = "Packing Activity";
const HEADERS = DEFAULT_SCHEMAS[SHEET_NAME];

async function ensureWorkerSheet(sheets) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" });
  if (metadata.data.sheets.some(sheet => sheet.properties.title === SHEET_NAME)) return;
  try {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `'${SHEET_NAME}'!A1:G1`, valueInputOption: "RAW", requestBody: { values: [HEADERS] } });
  } catch (error) {
    const retry = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" });
    if (!retry.data.sheets.some(sheet => sheet.properties.title === SHEET_NAME)) throw error;
  }
}

function rowsToWorkerLogs(rows = []) {
  return rows.filter(row => row[1] && row[2]).map(row => ({
    timestamp: row[0] || "",
    batchId: row[1] || "",
    orderId: row[2] || "",
    worker: row[3] || "",
    action: row[4] || "",
    buyerNickname: row[5] || "",
    finalGroup: row[6] || ""
  }));
}

async function appendWorkerLog(input) {
  const log = { timestamp: new Date().toISOString(), ...validateWorkerLog(input) };
  const sheets = await getSheetsClient();
  await ensureWorkerSheet(sheets);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!A:G`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[log.timestamp, log.batchId, log.orderId, log.worker, log.action, log.buyerNickname, log.finalGroup]] }
  });
  return log;
}

async function readSharedWorkerLogs(batchId) {
  const sheets = await getSheetsClient();
  await ensureWorkerSheet(sheets);
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${SHEET_NAME}'!A2:G` });
  const logs = rowsToWorkerLogs(response.data.values || []);
  return batchId ? logs.filter(log => log.batchId === batchId) : logs;
}

module.exports = { SHEET_NAME, HEADERS, ensureWorkerSheet, rowsToWorkerLogs, appendWorkerLog, readSharedWorkerLogs };
