const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const config = require("./appConfig");

const { processPDFs } = require("./pdfProcessor");
const { readLogs, addWorkerLog, validateWorkerLog, buildWorkerLogForOrder } = require("./workerTracker");
const { findBatch } = require("./batchService");
const { previewDailyInventoryUpdate, confirmDailyInventoryUpdate } = require("./dailyInventoryUpdate");
const {
  readInventory,
  readInventoryHistory,
  readInventoryHistoryByTransactionId,
  appendInventoryReconciliationHistory,
  withInventoryLock,
  getSheetsClient,
  SPREADSHEET_ID
} = require("./googleInventoryManager");
const { summarizeInventory } = require("./inventoryAnalytics");
const { createReceiptService } = require("./inventoryReceiptService");
const { createGoogleBatchRegistry } = require("./googleBatchRegistry");
const { listLocalPackingBatches, combinePackingBatchHistory } = require("./packingBatchHistory");
const { appendWorkerLog, readSharedWorkerLogs } = require("./googleWorkerTracker");
const { buildInventoryReconciliation, createInventoryReconciliationService } = require("./inventoryReconciliation");
const { analyzePackingStorage } = require("./packingStorage");
const { OPERATIONS_SCHEMAS, createSchemaService } = require("./googleSheetsSchema");
const { createSupabaseClients, createSupabaseHealthService } = require("./supabaseClient");
const { createSupabaseOperationsMirror } = require("./supabaseOperationsMirror");
const { createSupabaseBatchStorage } = require("./supabaseBatchStorage");
const { createLowStockNotifier } = require("./emailNotifier");

const app = express();
const upload = multer({
  dest: "uploads/",
  limits: { files: config.maxUploadFiles, fileSize: config.maxUploadBytesPerFile },
  fileFilter(req, file, callback) {
    const isPdf = file.mimetype === "application/pdf" || path.extname(file.originalname).toLowerCase() === ".pdf";
    callback(isPdf ? null : new Error("Only PDF files can be uploaded."), isPdf);
  }
});

const receiptService = createReceiptService();
const batchRegistry = createGoogleBatchRegistry();
const operationsSchemaService = createSchemaService({
  getSheetsClient,
  spreadsheetId: SPREADSHEET_ID,
  schemas: OPERATIONS_SCHEMAS
});
const supabaseClients = createSupabaseClients();
const supabaseHealthService = createSupabaseHealthService({ client: supabaseClients.service });
const supabaseOperationsMirror = createSupabaseOperationsMirror({
  client: supabaseClients.service,
  enabled: config.supabase.databaseMirrorEnabled
});
const supabaseBatchStorage = createSupabaseBatchStorage({
  client: supabaseClients.service,
  enabled: config.supabase.storageMirrorEnabled,
  bucket: config.supabase.storageBucket
});
const inventoryReconciliationService = createInventoryReconciliationService({
  inventoryReader: readInventory,
  historyReader: readInventoryHistoryByTransactionId,
  sharedLock: withInventoryLock,
  historyAppender: appendInventoryReconciliationHistory
});
const lowStockNotifier = createLowStockNotifier();

function loadPackingStorage() {
  return analyzePackingStorage(path.join(__dirname, "outputs"), {
    warningBytes: config.packingStorageWarningBytes,
    minimumFreeBytes: config.minimumFreeDiskBytes
  });
}

async function mirrorBatchToSupabase(batchId, { includeFiles = false } = {}) {
  if (!supabaseOperationsMirror.enabled && !supabaseBatchStorage.enabled) return { enabled: false, mirrored: false };
  const outputsDir = path.join(__dirname, "outputs");
  const found = findBatch(outputsDir, batchId);
  if (!found) throw new Error("The local packing batch could not be loaded for Supabase mirroring.");
  const read = fileName => JSON.parse(fs.readFileSync(path.join(found.runDir, fileName), "utf8"));
  const database = await supabaseOperationsMirror.mirrorPackingBatch({
    batch: found.batch,
    orders: found.orders,
    summary: read("summary.json"),
    verification: read("verification_report.json")
  });
  const storage = includeFiles
    ? await supabaseBatchStorage.mirrorBatch({ batch: found.batch, runDir: found.runDir, outputsDir })
    : { mirrored: false, files: 0 };
  return { enabled: true, mirrored: Boolean(database.mirrored || storage.mirrored), database, storage };
}

async function mirrorInventoryToSupabase() {
  if (!supabaseOperationsMirror.enabled) return { enabled: false, mirrored: false };
  const [inventory, history] = await Promise.all([readInventory(), readInventoryHistory(5000)]);
  const [inventoryResult, historyResult] = await Promise.all([
    supabaseOperationsMirror.mirrorInventory(inventory),
    supabaseOperationsMirror.mirrorInventoryHistory(history)
  ]);
  return { enabled: true, mirrored: true, inventory: inventoryResult, history: historyResult };
}

async function safeSupabaseMirror(operation) {
  try {
    return await operation();
  } catch (error) {
    console.error("Supabase mirror failed without changing the primary Google Sheets workflow:", error.message);
    return { enabled: true, mirrored: false, warning: error.message };
  }
}

async function safeLowStockEmail(changes, metadata) {
  try {
    return await lowStockNotifier.sendForChanges(changes, metadata);
  } catch (error) {
    console.error("Low-stock email failed after the inventory transaction completed:", error.message);
    return { enabled: true, sent: false, warning: error.message };
  }
}

function withTimeout(promise, milliseconds, message) {
  let timeout;
  const deadline = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
}

async function loadPackingBatchData() {
  const localBatches = listLocalPackingBatches(path.join(__dirname, "outputs"));
  try {
    const sharedRows = await withTimeout(batchRegistry.listRecords(), 8000, "Shared batch registry timed out.");
    return { batches: combinePackingBatchHistory(localBatches, sharedRows), sharedRegistryConnected: true };
  } catch {
    return {
      batches: combinePackingBatchHistory(localBatches),
      sharedRegistryConnected: false,
      warning: "Shared duplicate-protection status is temporarily unavailable; local batch history is shown."
    };
  }
}

async function loadWorkerActivity(batchId) {
  try {
    const logs = await withTimeout(readSharedWorkerLogs(batchId), 8000, "Shared worker activity timed out.");
    return { logs, shared: true, warning: null };
  } catch {
    const logs = readLogs().filter(log => !batchId || !log.batchId || log.batchId === batchId);
    return { logs, shared: false, warning: "Shared worker activity is temporarily unavailable; local backup activity is shown." };
  }
}

async function removeUploadedFiles(files = []) {
  await Promise.all(files.map(file => fs.promises.unlink(file.path).catch(error => {
    if (error.code !== "ENOENT") console.error(`Could not remove upload ${file.path}:`, error.message);
  })));
}

function uploadPackingPdfs(req, res, next) {
  upload.array("pdfs")(req, res, async error => {
    if (!error) return next();
    await removeUploadedFiles(req.files || []);
    res.status(400).json({ error: error.message });
  });
}

function validBatchId(batchId) {
  return /^[a-f0-9]{64}$/.test(batchId);
}

app.use(express.static("public"));
app.use(express.json());

app.get("/system/status", async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const [response, schemaValidation, supabase] = await Promise.all([
      sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" }),
      operationsSchemaService.inspectAll(),
      supabaseHealthService.inspect()
    ]);
    const availableTabs = (response.data.sheets || []).map(sheet => sheet.properties.title);
    const available = new Set(availableTabs);
    res.json({
      googleSheets: {
        connected: true,
        availableTabs,
        tabs: Object.fromEntries(Object.keys(OPERATIONS_SCHEMAS).map(tab => [tab, available.has(tab)])),
        schemaValidation
      },
      supabase,
      networkSecurity: { host: config.host, localOnly: ["127.0.0.1", "localhost", "::1"].includes(config.host) },
      uploadLimits: { files: config.maxUploadFiles, megabytesPerFile: Math.round(config.maxUploadBytesPerFile / 1024 / 1024) },
      packingStorage: loadPackingStorage(),
      activeFeatures: config.inventoryWritesEnabled
        ? ["PACKING", "INVENTORY_READ", "INVENTORY_WRITE", "WORKER_TRACKING"]
        : ["PACKING", "INVENTORY_READ", "WORKER_TRACKING"],
      inventoryWritesEnabled: config.inventoryWritesEnabled,
      inventoryTrackingScope: config.inventoryTrackingScope,
      lowStockEmail: { enabled: config.lowStockEmail.enabled, configured: config.lowStockEmail.configured },
      operatingMode: config.inventoryWritesEnabled ? "PACKING_AND_INVENTORY" : "PACKING_ONLY"
    });
  } catch (error) {
    res.status(503).json({ googleSheets: { connected: false, error: error.message }, supabase: supabaseClients.status });
  }
});

app.get("/supabase/status", async (req, res) => {
  try {
    res.json(await supabaseHealthService.inspect());
  } catch (error) {
    res.status(503).json({ ...supabaseClients.status, connected: false, error: error.message });
  }
});

app.post("/process", uploadPackingPdfs, async (req, res) => {
  const filePaths = (req.files || []).map(file => file.path);
  try {
    if (!req.files || req.files.length === 0) return res.status(400).send("No PDFs uploaded.");
    const result = await processPDFs(filePaths);
    const supabaseMirror = await safeSupabaseMirror(() => mirrorBatchToSupabase(result.batch.batchId, { includeFiles: true }));
    res.json({
      success: true,
      batch: result.batch,
      reviewUrl: `/batches/${result.batch.batchId}`,
      downloadUrl: `/batches/${result.batch.batchId}/download`,
      supabaseMirror
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(`Error processing PDFs: ${error.message}`);
  } finally {
    await removeUploadedFiles((req.files || []).map(file => ({ path: file.path })));
  }
});

app.get("/batches/:batchId", async (req, res) => {
  try {
    if (!validBatchId(req.params.batchId)) return res.status(400).json({ error: "Invalid batch ID." });
    res.json(await previewDailyInventoryUpdate(req.params.batchId));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.get("/packing-batches", async (req, res) => {
  res.json(await loadPackingBatchData());
});

app.get("/batches/:batchId/download", async (req, res) => {
  try {
    if (!validBatchId(req.params.batchId)) return res.status(400).json({ error: "Invalid batch ID." });
    const found = findBatch(path.join(__dirname, "outputs"), req.params.batchId);
    if (found) {
      const zipPath = path.join(__dirname, "outputs", found.batch.zipFile);
      if (fs.existsSync(zipPath)) return res.download(zipPath, `packing_${found.batch.runId}.zip`);
    }
    const signedUrl = await supabaseBatchStorage.createSignedZipUrl(req.params.batchId);
    if (signedUrl) return res.redirect(302, signedUrl);
    res.status(404).json({ error: found ? "Packing ZIP was not found." : "Packing batch was not found." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/batches/:batchId/confirm", async (req, res) => {
  try {
    if (!validBatchId(req.params.batchId)) return res.status(400).json({ error: "Invalid batch ID." });
    if (!config.inventoryWritesEnabled) return res.status(503).json({ error: "Inventory changes are disabled until the verified warehouse starting count is complete." });
    const user = String(req.body.user || "").trim();
    if (!user) return res.status(400).json({ error: "User is required." });
    const result = await confirmDailyInventoryUpdate(req.params.batchId, { user, reason: "Confirmed packing batch" });
    const [batchMirror, inventoryMirror, lowStockEmail] = await Promise.all([
      safeSupabaseMirror(() => mirrorBatchToSupabase(req.params.batchId)),
      safeSupabaseMirror(() => mirrorInventoryToSupabase()),
      safeLowStockEmail(result.updateResult?.changes || [], { batchId: req.params.batchId, user })
    ]);
    res.json({ ...result, lowStockEmail, supabaseMirror: { batch: batchMirror, inventory: inventoryMirror } });
  } catch (error) {
    res.status(/already/i.test(error.message) ? 409 : 500).json({ error: error.message });
  }
});

app.get("/inventory", async (req, res) => {
  try {
    res.json(summarizeInventory(await readInventory()));
  } catch (error) {
    res.status(500).json({ error: `Could not load Google Sheets inventory. ${error.message}` });
  }
});

app.get("/inventory-history", async (req, res) => {
  try {
    res.json({ history: await readInventoryHistory(req.query.limit) });
  } catch (error) {
    res.status(500).json({ error: `Could not load inventory history. ${error.message}` });
  }
});

app.get("/inventory/reconciliation", async (req, res) => {
  try {
    res.json(await inventoryReconciliationService.preview());
  } catch (error) {
    res.status(503).json({ error: `Could not compare current inventory with Inventory History. ${error.message}` });
  }
});

app.post("/inventory/reconciliation/confirm", async (req, res) => {
  try {
    if (!config.inventoryWritesEnabled) return res.status(503).json({ error: "Inventory changes are disabled until the verified warehouse starting count is complete." });
    const result = await inventoryReconciliationService.confirm(req.body);
    const supabaseMirror = await safeSupabaseMirror(() => mirrorInventoryToSupabase());
    res.json({ ...result, supabaseMirror });
  } catch (error) {
    res.status(/required/i.test(error.message) ? 400 : 503).json({ error: `Could not record inventory reconciliation. ${error.message}` });
  }
});

app.post("/inventory/receive/preview", async (req, res) => {
  try {
    if (!config.inventoryWritesEnabled) return res.status(503).json({ error: "Receiving inventory is disabled until the verified warehouse starting count is complete." });
    res.json(await receiptService.preview(req.body));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/inventory/receive/:receiptId/confirm", async (req, res) => {
  try {
    if (!config.inventoryWritesEnabled) return res.status(503).json({ error: "Receiving inventory is disabled until the verified warehouse starting count is complete." });
    const result = await receiptService.confirm(req.params.receiptId);
    const supabaseMirror = await safeSupabaseMirror(() => mirrorInventoryToSupabase());
    res.json({ ...result, supabaseMirror });
  } catch (error) {
    res.status(/already confirmed/i.test(error.message) ? 409 : 500).json({ error: error.message });
  }
});

app.get("/packing-storage", (req, res) => {
  try {
    res.json({ ...loadPackingStorage(), refreshedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: `Could not inspect generated packing storage. ${error.message}` });
  }
});

app.get("/latest-orders", (req, res) => {
  try {
    const latest = findBatch(path.join(__dirname, "outputs"));
    if (!latest) return res.json({ orders: [] });
    res.json({ runId: latest.batch.runId, batchId: latest.batch.batchId, orders: latest.orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load latest orders." });
  }
});

app.post("/worker-log", async (req, res) => {
  try {
    const input = validateWorkerLog(req.body);
    const found = findBatch(path.join(__dirname, "outputs"), input.batchId);
    if (!found) return res.status(404).json({ success: false, error: "Packing batch was not found." });
    const order = found.orders.find(order => String(order.orderId || "") === input.orderId);
    if (!order) return res.status(400).json({ success: false, error: "This order does not belong to the selected packing batch." });
    const authoritativeInput = buildWorkerLogForOrder(input, order);
    const log = await appendWorkerLog(authoritativeInput);
    try {
      addWorkerLog(authoritativeInput);
    } catch (backupError) {
      console.error("Shared worker action saved, but local backup failed:", backupError.message);
    }
    const supabaseMirror = await safeSupabaseMirror(() => supabaseOperationsMirror.mirrorPackingActivity(log));
    res.json({ success: true, log, shared: true, supabaseMirror });
  } catch (error) {
    console.error(error);
    res.status(/required|must|valid|belong/i.test(error.message) ? 400 : 503).json({
      success: false,
      error: `Could not save shared worker activity. ${error.message}`
    });
  }
});

app.get("/worker-logs", async (req, res) => {
  try {
    const batchId = String(req.query.batchId || "").trim();
    if (batchId && !validBatchId(batchId)) return res.status(400).json({ error: "Invalid batch ID." });
    const activity = await loadWorkerActivity(batchId || null);
    if (!batchId) return res.json(activity.logs);
    res.json(activity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not read worker logs." });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "This feature is not part of the simplified packing and inventory app." });
});

if (require.main === module) {
  const server = app.listen(config.port, config.host);
  server.once("listening", () => {
    console.log(`Packing app running at http://${config.host}:${config.port}`);
  });
  server.once("error", error => {
    console.error(`Packing app could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = app;
