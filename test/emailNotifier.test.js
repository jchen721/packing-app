const test = require("node:test");
const assert = require("node:assert/strict");
const { findLowStockCrossings, buildLowStockMessage, createLowStockNotifier } = require("../emailNotifier");

const changes = [
  { item: "8x8x4 Boxes", previousQuantity: 11, newQuantity: 10, lowStockLevel: 10, reorderAmount: 100 },
  { item: "6x6x6 Boxes", previousQuantity: 9, newQuantity: 8, lowStockLevel: 10, reorderAmount: 200 },
  { item: "16x12x6 Boxes", previousQuantity: 25, newQuantity: 24, lowStockLevel: 10, reorderAmount: 50 }
];

test("low-stock alerts fire only when a deduction first crosses the threshold", () => {
  assert.deepEqual(findLowStockCrossings(changes).map(row => row.item), ["8x8x4 Boxes"]);
});

test("low-stock email contains operational quantities without credentials", () => {
  const message = buildLowStockMessage([changes[0]], { batchId: "batch-1", user: "Manager" });
  assert.match(message, /8x8x4 Boxes: 10 remaining/);
  assert.match(message, /suggested reorder: 100/);
  assert.match(message, /batch-1/);
  assert.doesNotMatch(message, /password/i);
});

test("configured notifier sends one combined message to all configured recipients", async () => {
  let sent;
  const notifier = createLowStockNotifier({
    settings: { enabled: true, user: "sender@example.com", appPassword: "private", recipients: ["one@example.com", "two@example.com"] },
    transport: { async sendMail(message) { sent = message; return { messageId: "message-1" }; } }
  });
  const result = await notifier.sendForChanges(changes, { batchId: "batch-1", user: "Manager" });
  assert.equal(result.sent, true);
  assert.equal(result.alerts, 1);
  assert.deepEqual(sent.to, ["one@example.com", "two@example.com"]);
});

test("disabled notifier never sends", async () => {
  let calls = 0;
  const notifier = createLowStockNotifier({
    settings: { enabled: false, user: "sender@example.com", appPassword: "private", recipients: ["one@example.com"] },
    transport: { async sendMail() { calls++; } }
  });
  assert.deepEqual(await notifier.sendForChanges(changes), { enabled: false, sent: false });
  assert.equal(calls, 0);
});
