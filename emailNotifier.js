const nodemailer = require("nodemailer");
const config = require("./appConfig");

function findLowStockCrossings(changes = []) {
  return changes.filter(change => {
    const previous = Number(change.previousQuantity);
    const current = Number(change.newQuantity);
    const limit = Number(change.lowStockLevel);
    return Number.isFinite(previous) && Number.isFinite(current) && Number.isFinite(limit) && previous > limit && current <= limit;
  });
}

function buildLowStockMessage(changes, metadata = {}) {
  const lines = [
    "Ace Collectibles box inventory alert",
    "",
    ...changes.map(change => `${change.item}: ${change.newQuantity} remaining (low-stock level: ${change.lowStockLevel}; suggested reorder: ${change.reorderAmount || "not set"})`),
    "",
    `Packing batch: ${metadata.batchId || "Unknown"}`,
    `Confirmed by: ${metadata.user || "Unknown user"}`,
    "",
    "Review the shared Box Inventory sheet before placing an order."
  ];
  return lines.join("\n");
}

function createLowStockNotifier({ settings = config.lowStockEmail, transport } = {}) {
  const configured = Boolean(settings?.user && settings?.appPassword && settings?.recipients?.length);
  const mailer = transport || (configured ? nodemailer.createTransport({
    service: "gmail",
    auth: { user: settings.user, pass: settings.appPassword }
  }) : null);

  async function sendForChanges(changes, metadata = {}) {
    if (!settings?.enabled) return { enabled: false, sent: false };
    if (!configured || !mailer) throw new Error("Low-stock email is enabled but Gmail sender, app password, or recipients are missing.");
    const lowStock = findLowStockCrossings(changes);
    if (!lowStock.length) return { enabled: true, sent: false, alerts: 0 };
    const info = await mailer.sendMail({
      from: settings.user,
      to: settings.recipients,
      subject: `Ace Collectibles low box inventory: ${lowStock.map(change => change.item).join(", ")}`,
      text: buildLowStockMessage(lowStock, metadata)
    });
    return { enabled: true, sent: true, alerts: lowStock.length, messageId: info.messageId || "" };
  }

  return { configured, sendForChanges };
}

module.exports = { findLowStockCrossings, buildLowStockMessage, createLowStockNotifier };
