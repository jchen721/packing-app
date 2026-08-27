const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveSupabaseSettings } = require("../appConfig");
const { safeSupabaseStatus, createSupabaseHealthService } = require("../supabaseClient");
const { stableId, sanitizePostgresJson, createSupabaseOperationsMirror } = require("../supabaseOperationsMirror");
const { safeFiles, createSupabaseBatchStorage } = require("../supabaseBatchStorage");

test("Supabase stays disabled unless explicitly enabled with all server settings", () => {
  assert.deepEqual(resolveSupabaseSettings({}), {
    enabled: false, url: "", publishableKey: "", secretKey: "", configured: false,
    databaseMirrorEnabled: false, storageMirrorEnabled: false, storageMirrorRequiresDatabase: false, authEnabled: false, storageBucket: "packing-files"
  });
  const configured = resolveSupabaseSettings({
    SUPABASE_ENABLED: "true", SUPABASE_URL: "https://ace.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public", SUPABASE_SECRET_KEY: "secret",
    SUPABASE_DATABASE_MIRROR_ENABLED: "true", SUPABASE_STORAGE_MIRROR_ENABLED: "true"
  });
  assert.equal(configured.configured, true);
  assert.equal(configured.databaseMirrorEnabled, true);
  assert.equal(configured.storageMirrorEnabled, true);
  assert.equal(safeSupabaseStatus(configured).secretKey, undefined);
});

test("file mirroring cannot activate without the parent database records", () => {
  const settings = resolveSupabaseSettings({
    SUPABASE_ENABLED: "true", SUPABASE_URL: "https://ace.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public", SUPABASE_SECRET_KEY: "secret",
    SUPABASE_STORAGE_MIRROR_ENABLED: "true"
  });
  assert.equal(settings.storageMirrorEnabled, false);
  assert.equal(settings.storageMirrorRequiresDatabase, true);
});

test("Supabase health reports missing schema and storage without exposing keys", async () => {
  const query = { select() { return this; }, limit: async () => ({ error: null }) };
  const client = { from() { return query; }, storage: { async getBucket() { return { data: null, error: { message: "missing" } }; } } };
  const settings = {
    enabled: true, configured: true, url: "https://ace.supabase.co", publishableKey: "public", secretKey: "private",
    databaseMirrorEnabled: false, storageMirrorEnabled: false, authEnabled: false, storageBucket: "packing-files"
  };
  const status = await createSupabaseHealthService({ client, settings, requiredTables: ["one"] }).inspect();
  assert.equal(status.connected, true);
  assert.equal(status.schemaReady, true);
  assert.equal(status.storageReady, false);
  assert.equal(status.status, "SETUP_REQUIRED");
  assert.doesNotMatch(JSON.stringify(status), /private/);
});

function fakeDatabase() {
  const writes = [];
  return {
    writes,
    client: {
      from(table) {
        return { async upsert(rows, options) { writes.push({ table, rows: Array.isArray(rows) ? rows : [rows], options }); return { data: rows, error: null }; } };
      }
    }
  };
}

test("operations mirror uses stable IDs and idempotent upserts", async () => {
  const fake = fakeDatabase();
  const mirror = createSupabaseOperationsMirror({ client: fake.client, enabled: true, now: () => "2026-08-14T00:00:00.000Z" });
  await mirror.mirrorInventory([{ item: "Gem Packs", category: "Pokémon Products", quantity: 10, lowStockLevel: 2, reorderAmount: 20 }]);
  await mirror.mirrorInventoryHistory([{ timestamp: "2026-08-14T00:00:00.000Z", transactionId: "tx-1", item: "Gem Packs", category: "Pokémon Products", previousQuantity: 12, quantityChanged: -2, newQuantity: 10, actionType: "DEDUCTION", reason: "Batch", user: "Jerry" }]);
  assert.equal(fake.writes[0].table, "inventory_items");
  assert.equal(fake.writes[1].table, "inventory_movements");
  assert.equal(fake.writes[1].rows[0].movement_id, stableId("movement", ["tx-1", "Gem Packs", "2026-08-14T00:00:00.000Z", -2]));
  assert.equal(fake.writes[1].options.onConflict, "movement_id");
});

test("packing order mirror removes PostgreSQL-incompatible PDF characters without changing the manifest", async () => {
  const fake = fakeDatabase();
  const mirror = createSupabaseOperationsMirror({ client: fake.client, enabled: true });
  const order = {
    orderId: "order-1",
    buyerNickname: "Jerry\u0000Chen",
    products: [{ name: "Chaos \ud800 Rising", note: "line one\nline two" }]
  };
  await mirror.mirrorPackingBatch({
    batch: { batchId: "b".repeat(64), createdAt: "2026-08-14T00:00:00.000Z", status: "awaiting_inventory_confirmation" },
    orders: [order]
  });
  const write = fake.writes.find(row => row.table === "packing_batch_orders");
  assert.equal(write.rows[0].order_data.buyerNickname, "JerryChen");
  assert.equal(write.rows[0].order_data.products[0].name, "Chaos \ufffd Rising");
  assert.equal(write.rows[0].order_data.products[0].note, "line one\nline two");
  assert.equal(order.buyerNickname, "Jerry\u0000Chen");
  assert.equal(sanitizePostgresJson({ "bad\u0000key": "ok" }).badkey, "ok");
});

test("packing order mirror sends large batches in bounded chunks", async () => {
  const fake = fakeDatabase();
  const mirror = createSupabaseOperationsMirror({ client: fake.client, enabled: true });
  const orders = Array.from({ length: 205 }, (_, index) => ({ orderId: `order-${index}` }));
  await mirror.mirrorPackingBatch({
    batch: { batchId: "c".repeat(64), createdAt: "2026-08-14T00:00:00.000Z", status: "awaiting_inventory_confirmation" },
    orders
  });
  const writes = fake.writes.filter(row => row.table === "packing_batch_orders");
  assert.deepEqual(writes.map(write => write.rows.length), [100, 100, 5]);
});

test("batch storage uploads only audited artifacts and indexes the run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ace-supabase-batch-"));
  const runDir = path.join(root, "run-1"); fs.mkdirSync(runDir);
  fs.writeFileSync(path.join(runDir, "batch.json"), "{}");
  fs.writeFileSync(path.join(runDir, "8x8x4.pdf"), "pdf");
  fs.writeFileSync(path.join(runDir, "ignore.txt"), "private scratch");
  fs.writeFileSync(path.join(root, "packing.zip"), "zip");
  const uploads = []; const fake = fakeDatabase();
  fake.client.storage = { from(bucket) { return {
    async upload(objectPath, body, options) { uploads.push({ bucket, objectPath, size: body.length, options }); return { data: {}, error: null }; },
    async createSignedUrl() { return { data: { signedUrl: "https://signed.example" }, error: null }; }
  }; } };
  const store = createSupabaseBatchStorage({ client: fake.client, enabled: true, bucket: "packing-files", now: () => "2026-08-14T00:00:00.000Z" });
  const batch = { batchId: "a".repeat(64), runId: "run-1", createdAt: "2026-08-14T00:00:00.000Z", status: "awaiting_inventory_confirmation", zipFile: "packing.zip" };
  const result = await store.mirrorBatch({ batch, runDir, outputsDir: root });
  assert.equal(result.files, 3);
  assert.deepEqual(safeFiles(runDir).map(file => path.basename(file)).sort(), ["8x8x4.pdf", "batch.json"]);
  assert.equal(uploads.some(row => row.objectPath.endsWith("ignore.txt")), false);
  assert.ok(fake.writes.some(row => row.table === "packing_batch_runs"));
  assert.ok(fake.writes.some(row => row.table === "packing_batch_artifacts"));
});
