const fs = require("fs");
const path = require("path");
const config = require("./appConfig");
const { readInventory, readInventoryHistory } = require("./googleInventoryManager");
const { readCompleteBatch } = require("./batchService");
const { createSupabaseClients, createSupabaseHealthService } = require("./supabaseClient");
const { createSupabaseOperationsMirror } = require("./supabaseOperationsMirror");
const { createSupabaseBatchStorage } = require("./supabaseBatchStorage");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listCompleteRuns(outputsDir) {
  if (!fs.existsSync(outputsDir)) return [];
  return fs.readdirSync(outputsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ runDir: path.join(outputsDir, entry.name), complete: readCompleteBatch(path.join(outputsDir, entry.name)) }))
    .filter(entry => entry.complete);
}

async function main() {
  const clients = createSupabaseClients();
  if (!config.supabase.configured || !clients.service) throw new Error("Configure and enable Supabase before running the mirror.");
  const health = await createSupabaseHealthService({ client: clients.service }).inspect();
  if (health.status !== "READY") throw new Error(`Supabase is ${health.status}; apply the migration and verify the private bucket first.`);
  if (!config.supabase.databaseMirrorEnabled && !config.supabase.storageMirrorEnabled) throw new Error("Enable at least one Supabase mirror switch before running the mirror.");

  const database = createSupabaseOperationsMirror({ client: clients.service, enabled: config.supabase.databaseMirrorEnabled });
  const storage = createSupabaseBatchStorage({ client: clients.service, enabled: config.supabase.storageMirrorEnabled, bucket: config.supabase.storageBucket });
  const outputsDir = path.join(__dirname, "outputs");
  const [inventory, history] = await Promise.all([readInventory(), readInventoryHistory(50000)]);
  const inventoryResult = await database.mirrorInventory(inventory);
  const historyResult = await database.mirrorInventoryHistory(history);
  let batchRuns = 0;
  let artifacts = 0;
  for (const run of listCompleteRuns(outputsDir)) {
    const batch = run.complete.batch;
    await database.mirrorPackingBatch({
      batch,
      orders: run.complete.orders,
      summary: readJson(path.join(run.runDir, "summary.json")),
      verification: readJson(path.join(run.runDir, "verification_report.json"))
    });
    const stored = await storage.mirrorBatch({ batch, runDir: run.runDir, outputsDir });
    batchRuns += 1;
    artifacts += stored.files || 0;
  }
  console.log(JSON.stringify({ success: true, inventory: inventoryResult.count, movements: historyResult.count, batchRuns, artifacts }, null, 2));
}

if (require.main === module) main().catch(error => {
  console.error(`Supabase mirror failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { listCompleteRuns, main };
