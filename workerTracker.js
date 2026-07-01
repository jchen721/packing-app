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

function addWorkerLog({ worker, action, orderId, buyerNickname, finalGroup }) {
  const logs = readLogs();

  const log = {
    timestamp: new Date().toISOString(),
    worker,
    action,
    orderId,
    buyerNickname,
    finalGroup
  };

  logs.push(log);
  saveLogs(logs);

  return log;
}

module.exports = {
  readLogs,
  addWorkerLog
};