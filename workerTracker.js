const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "worker_logs.json");

function readLogs() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
}

function saveLogs(logs) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}

function validateWorkerLog(input = {}) {
  const log = {
    batchId: String(input.batchId || "").trim(),
    worker: String(input.worker || "").trim(),
    action: String(input.action || "").trim().toUpperCase(),
    orderId: String(input.orderId || "").trim(),
    buyerNickname: String(input.buyerNickname || "").trim(),
    finalGroup: String(input.finalGroup || "").trim()
  };
  if (!/^[a-f0-9]{64}$/.test(log.batchId)) throw new Error("A valid packing batch is required.");
  if (!log.worker || log.worker.length > 100) throw new Error("A valid worker name is required.");
  if (!log.orderId || log.orderId.length > 200) throw new Error("A valid order ID is required.");
  if (!["START", "DONE", "ISSUE"].includes(log.action)) throw new Error("Worker action must be START, DONE, or ISSUE.");
  return log;
}

function buildWorkerLogForOrder(input, order) {
  const validated = validateWorkerLog(input);
  return {
    ...validated,
    buyerNickname: String(order?.buyerNickname || "").trim(),
    finalGroup: String(order?.finalGroup || "").trim()
  };
}

function addWorkerLog(input) {
  const logs = readLogs();
  const validated = validateWorkerLog(input);

  const log = {
    timestamp: new Date().toISOString(),
    ...validated
  };

  logs.push(log);
  saveLogs(logs);

  return log;
}

module.exports = {
  readLogs,
  addWorkerLog,
  validateWorkerLog,
  buildWorkerLogForOrder
};
