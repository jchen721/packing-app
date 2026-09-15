const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBatchManifest, saveBatchFiles, findBatch } = require("../batchService");
const { createConfirmationService, selectTrackedInventoryUsage, validateResolvedBoxUsage } = require("../dailyInventoryUpdate");

function sampleOrders() {
  return [{ sourceFile: "orders.pdf", orderId: "100", trackingNumber: "200", finalGroup: "8x8x4", exactPackingGroup: "8x8x4", products: [
    { productName: "Perfect Order ETB", pdfQty: 1, physicalQty: 1 }
  ] }];
}

function makeBatch() {
  const outputsDir = fs.mkdtempSync(path.join(os.tmpdir(), "packing-test-"));
  const runDir = path.join(outputsDir, "123"); fs.mkdirSync(runDir);
  const orders = sampleOrders();
  const verification = { totalOutputPages: 2 };
  const manifest = createBatchManifest({ runId: "123", orders, summary: { totalOrders: 1 }, verification, zipPath: "outputs/packing_output_123.zip" });
  saveBatchFiles(runDir, manifest, orders);
  return { outputsDir, runDir, manifest };
}

function memoryRegistry(processed = false) {
  let record = processed ? { batchId: null } : null;
  return { setBatchId(id) { if (record) record.batchId = id; }, has(id) { return record?.batchId === id; }, markProcessed(value) { if (record?.batchId === value.batchId) throw new Error("already processed"); record = value; }, get record() { return record; } };
}

test("batch creation is stable and saves every audit manifest", () => {
  const first = makeBatch();
  const second = makeBatch();
  assert.equal(first.manifest.batch.batchId, second.manifest.batch.batchId);
  for (const file of ["orders.json", "summary.json", "verification_report.json", "inventory_usage.json", "batch.json", "groupedOrders.json"]) {
    assert.equal(fs.existsSync(path.join(first.runDir, file)), true, file);
  }
});

test("batch ID ignores temporary source names and upload order", () => {
  const orders = sampleOrders();
  const reversed = [
    { ...orders[0], sourceFile: "random-upload-a" },
    { ...orders[0], sourceFile: "random-upload-b", orderId: "101", trackingNumber: "201" }
  ];
  const reordered = [
    { ...reversed[1], sourceFile: "different-temp-name" },
    { ...reversed[0], sourceFile: "another-temp-name" }
  ];
  const make = list => createBatchManifest({ runId: "1", orders: list, summary: {}, verification: { totalOutputPages: 4 }, zipPath: "x.zip" }).batch.batchId;
  assert.equal(make(reversed), make(reordered));
});

test("latest batch lookup skips incomplete runs and uses manifest creation time", () => {
  const outputsDir = fs.mkdtempSync(path.join(os.tmpdir(), "latest-packing-test-"));
  function saveComplete(runId, orderId, createdAt) {
    const runDir = path.join(outputsDir, runId); fs.mkdirSync(runDir);
    const orders = sampleOrders().map(order => ({ ...order, orderId }));
    const manifest = createBatchManifest({ runId, orders, summary: { totalOrders: 1 }, verification: { totalOutputPages: 2 }, zipPath: `outputs/packing_output_${runId}.zip` });
    manifest.batch.createdAt = createdAt;
    saveBatchFiles(runDir, manifest, orders);
    return manifest.batch;
  }
  saveComplete("999", "older", "2026-08-01T12:00:00.000Z");
  const expected = saveComplete("100", "newer", "2026-08-02T12:00:00.000Z");
  const incompleteDir = path.join(outputsDir, "1000"); fs.mkdirSync(incompleteDir);
  fs.writeFileSync(path.join(incompleteDir, "batch.json"), JSON.stringify({ batchId: "a".repeat(64), runId: "1000", createdAt: "2026-08-03T12:00:00.000Z" }));
  fs.writeFileSync(path.join(incompleteDir, "orders.json"), "not valid json");
  const found = findBatch(outputsDir);
  assert.equal(found.batch.batchId, expected.batchId);
  assert.equal(found.orders[0].orderId, "newer");
});

test("successful confirmation updates inventory before marking processed", async () => {
  const fixture = makeBatch(); const registry = memoryRegistry(); let received;
  const service = createConfirmationService({ outputsDir: fixture.outputsDir, registry, inventoryGateway: { async subtractInventory(usage, metadata) { received = { usage, metadata }; return { success: true }; } } });
  const result = await service.confirm(fixture.manifest.batch.batchId, { user: "Alice" });
  assert.equal(result.success, true); assert.equal(registry.record.batchId, fixture.manifest.batch.batchId);
  assert.equal(received.metadata.user, "Alice"); assert.equal(received.usage.length, 3);
});

test("box-only confirmation scope preserves products for audit but deducts only packing boxes", () => {
  const usage = [
    { item: "Perfect Order ETB", quantity: 4 },
    { item: "8x8x4 Boxes", quantity: 2 },
    { item: "24 Boxes", quantity: 1 }
  ];
  assert.deepEqual(selectTrackedInventoryUsage(usage, "boxes"), [usage[1], usage[2]]);
  assert.deepEqual(selectTrackedInventoryUsage(usage, "all"), usage);
});

test("24-series inventory stays blocked until its exact physical height is approved", () => {
  assert.throws(() => validateResolvedBoxUsage([{ item: "24 Boxes", quantity: 1 }]), /24x12x4 or 24x12x6/);
  assert.equal(validateResolvedBoxUsage([{ item: "16x12x8 Boxes", quantity: 1 }]), true);
});

test("a box-only batch with no shipping box can still be finalized without an inventory write", async () => {
  const fixture = makeBatch();
  const registry = memoryRegistry();
  let calls = 0;
  const service = createConfirmationService({
    outputsDir: fixture.outputsDir,
    registry,
    selectUsage: () => [],
    allowEmptyUsage: true,
    inventoryGateway: { async subtractInventory() { calls++; } }
  });
  const result = await service.confirm(fixture.manifest.batch.batchId, { user: "Alice" });
  assert.equal(calls, 0);
  assert.deepEqual(result.itemsDeducted, []);
  assert.equal(registry.record.batchId, fixture.manifest.batch.batchId);
});

test("batch preview shows whether shared inventory covers every deduction", async () => {
  const fixture = makeBatch();
  const registry = memoryRegistry();
  const service = createConfirmationService({
    outputsDir: fixture.outputsDir,
    registry,
    inventoryGateway: {
      async readInventory() { return [{ item: "Perfect Order ETB", quantity: 3, category: "Pokémon Products" }, { item: "Bubble Wrap Pieces", quantity: 20, category: "Warehouse Supplies" }, { item: "8x8x4 Boxes", quantity: 2, category: "Warehouse Supplies" }]; },
      async subtractInventory() { throw new Error("not used"); }
    }
  });
  const preview = await service.preview(fixture.manifest.batch.batchId);
  assert.equal(preview.inventoryReady, true);
  assert.deepEqual(preview.inventoryAvailability.map(row => row.newQuantity), [2, 18, 1]);
});

test("duplicate confirmation is prevented before inventory mutation", async () => {
  const fixture = makeBatch(); const registry = memoryRegistry(true); registry.setBatchId(fixture.manifest.batch.batchId); let calls = 0;
  const service = createConfirmationService({ outputsDir: fixture.outputsDir, registry, inventoryGateway: { async subtractInventory() { calls++; } } });
  await assert.rejects(service.confirm(fixture.manifest.batch.batchId, { user: "Alice" }), /already/);
  assert.equal(calls, 0);
});

test("an order reused inside a different batch is prevented", async () => {
  const fixture = makeBatch(); let calls = 0;
  const registry = {
    has() { return false; },
    findProcessedOrders(keys) {
      return keys.includes("order:100") ? [{ orderKey: "order:100", batchId: "older-batch" }] : [];
    },
    markProcessed() { throw new Error("should not be called"); }
  };
  const service = createConfirmationService({ outputsDir: fixture.outputsDir, registry, inventoryGateway: { async subtractInventory() { calls++; } } });
  await assert.rejects(service.confirm(fixture.manifest.batch.batchId, { user: "Alice" }), /already deducted.*100/);
  assert.equal(calls, 0);
});

test("failed inventory confirmation never marks the batch processed", async () => {
  const fixture = makeBatch(); const registry = memoryRegistry();
  const service = createConfirmationService({ outputsDir: fixture.outputsDir, registry, inventoryGateway: { async subtractInventory() { throw new Error("Sheets unavailable"); } } });
  await assert.rejects(service.confirm(fixture.manifest.batch.batchId, { user: "Alice" }), /Sheets unavailable/);
  assert.equal(registry.record, null);
  const batch = JSON.parse(fs.readFileSync(path.join(fixture.runDir, "batch.json"), "utf8"));
  assert.equal(batch.status, "awaiting_inventory_confirmation");
});

test("shared reservation conflict blocks inventory before mutation", async () => {
  const fixture = makeBatch(); let calls = 0;
  const registry = {
    async has() { return false; }, async findProcessedOrders() { return []; },
    async reserve() { throw new Error("already reserved on another computer"); },
    async markProcessed() { throw new Error("should not be called"); }
  };
  const service = createConfirmationService({ outputsDir: fixture.outputsDir, registry, inventoryGateway: { async subtractInventory() { calls++; } } });
  await assert.rejects(service.confirm(fixture.manifest.batch.batchId, { user: "Alice" }), /another computer/);
  assert.equal(calls, 0);
});

test("inventory failure releases a shared reservation", async () => {
  const fixture = makeBatch(); let released = false;
  const registry = {
    async has() { return false; }, async findProcessedOrders() { return []; },
    async reserve() { return { attemptId: "attempt-1" }; },
    async release(reservation) { released = reservation.attemptId === "attempt-1"; },
    async markProcessed() { throw new Error("should not be called"); }
  };
  const service = createConfirmationService({ outputsDir: fixture.outputsDir, registry, inventoryGateway: { async subtractInventory() { throw new Error("Sheets inventory failure"); } } });
  await assert.rejects(service.confirm(fixture.manifest.batch.batchId, { user: "Alice" }), /inventory failure/);
  assert.equal(released, true);
});

test("registry finalization failure stays reserved after inventory changed", async () => {
  const fixture = makeBatch(); let released = false;
  const registry = {
    async has() { return false; }, async findProcessedOrders() { return []; },
    async reserve() { return { attemptId: "attempt-2" }; },
    async release() { released = true; },
    async markProcessed() { throw new Error("registry write failed"); }
  };
  const service = createConfirmationService({ outputsDir: fixture.outputsDir, registry, inventoryGateway: { async subtractInventory() { return { success: true }; } } });
  await assert.rejects(service.confirm(fixture.manifest.batch.batchId, { user: "Alice" }), /Inventory was updated.*Do not retry/);
  assert.equal(released, false);
});
