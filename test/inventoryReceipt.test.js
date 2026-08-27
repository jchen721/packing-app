const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createReceiptService } = require("../inventoryReceiptService");

function fixture(overrides = {}) {
  const receiptsDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-test-"));
  let added;
  const inventoryGateway = {
    async readInventory() { return [{ item: "Chaos Rising ETB", quantity: 10 }, { item: "8x8x4 Boxes", quantity: 20 }]; },
    async addInventory(items, metadata) { added = { items, metadata }; return { success: true }; },
    ...overrides
  };
  return { service: createReceiptService({ inventoryGateway, receiptsDir }), get added() { return added; } };
}

test("receipt preview aggregates items and calculates before and after quantities", async () => {
  const setup = fixture();
  const receipt = await setup.service.preview({ user: "Alice", reason: "PO-123", items: [
    { item: "Chaos Rising ETB", quantity: 3 }, { item: "chaos rising etb", quantity: 2 }
  ] });
  assert.equal(receipt.status, "awaiting_confirmation");
  assert.deepEqual(receipt.items, [{ item: "Chaos Rising ETB", quantity: 5, previousQuantity: 10, newQuantity: 15 }]);
});

test("receipt confirmation adds inventory with complete metadata", async () => {
  const setup = fixture();
  const receipt = await setup.service.preview({ user: "Alice", reason: "Delivery 42", items: [{ item: "8x8x4 Boxes", quantity: 4 }] });
  const result = await setup.service.confirm(receipt.receiptId);
  assert.equal(result.receipt.status, "confirmed");
  assert.equal(setup.added.metadata.receiptId, receipt.receiptId);
  assert.equal(setup.added.metadata.user, "Alice");
  assert.equal(setup.added.metadata.reason, "Delivery 42");
});

test("confirmed receipt cannot be applied twice", async () => {
  const setup = fixture();
  const receipt = await setup.service.preview({ user: "Alice", items: [{ item: "Chaos Rising ETB", quantity: 1 }] });
  await setup.service.confirm(receipt.receiptId);
  await assert.rejects(setup.service.confirm(receipt.receiptId), /already confirmed/);
});

test("failed Google update leaves receipt awaiting confirmation", async () => {
  const setup = fixture({ async addInventory() { throw new Error("Sheets unavailable"); } });
  const receipt = await setup.service.preview({ user: "Alice", items: [{ item: "Chaos Rising ETB", quantity: 1 }] });
  await assert.rejects(setup.service.confirm(receipt.receiptId), /Sheets unavailable/);
  assert.equal(setup.service.readReceipt(receipt.receiptId).status, "awaiting_confirmation");
});

test("same receipt cannot confirm concurrently in one server process", async () => {
  let release;
  const setup = fixture({ async addInventory() { await new Promise(resolve => { release = resolve; }); return { success: true }; } });
  const receipt = await setup.service.preview({ user: "Alice", items: [{ item: "Chaos Rising ETB", quantity: 1 }] });
  const first = setup.service.confirm(receipt.receiptId);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(setup.service.confirm(receipt.receiptId), /already in progress/);
  release(); await first;
});
