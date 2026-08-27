const crypto = require("crypto");

function stableId(prefix, values) {
  const payload = values.map(value => String(value ?? "").trim().toLowerCase()).join("\u001f");
  return `${prefix}_${crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32)}`;
}

function requireSuccess(result, operation) {
  if (result?.error) throw new Error(`${operation} failed. ${result.error.message || result.error}`);
  return result?.data;
}

// PostgreSQL jsonb cannot represent the NUL character, and it rejects unpaired
// UTF-16 surrogate code units. PDF text extraction can occasionally leave either
// one in otherwise valid order data, so clean only the Supabase copy while the
// original batch manifest remains unchanged on disk.
function cleanPostgresText(value) {
  const text = String(value ?? "").replace(/\u0000/g, "");
  let cleaned = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cleaned += text[index] + text[index + 1];
        index += 1;
      } else {
        cleaned += "\ufffd";
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      cleaned += "\ufffd";
    } else {
      cleaned += text[index];
    }
  }
  return cleaned;
}

function sanitizePostgresJson(value) {
  if (typeof value === "string") return cleanPostgresText(value);
  if (Array.isArray(value)) return value.map(sanitizePostgresJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [cleanPostgresText(key), sanitizePostgresJson(child)]));
  }
  return value;
}

function createSupabaseOperationsMirror({ client, enabled = false, now = () => new Date().toISOString() } = {}) {
  const active = Boolean(client && enabled);

  async function mirrorInventory(items = []) {
    if (!active || !items.length) return { mirrored: false, count: 0 };
    const capturedAt = now();
    const rows = items.map(item => ({
      inventory_id: stableId("inventory", [item.category, item.item]),
      item_name: item.item,
      category: item.category,
      quantity: Number(item.quantity),
      low_stock_level: Number(item.lowStockLevel || 0),
      reorder_amount: Number(item.reorderAmount || 0),
      source_system: "GOOGLE_SHEETS",
      source_updated_at: capturedAt,
      updated_at: capturedAt
    }));
    requireSuccess(await client.from("inventory_items").upsert(rows, { onConflict: "inventory_id" }), "Supabase inventory mirror");
    return { mirrored: true, count: rows.length };
  }

  async function mirrorInventoryHistory(records = []) {
    if (!active || !records.length) return { mirrored: false, count: 0 };
    const rows = records.map(record => ({
      movement_id: stableId("movement", [record.transactionId, record.item, record.timestamp, record.quantityChanged]),
      occurred_at: record.timestamp,
      transaction_id: record.transactionId,
      item_name: record.item,
      category: record.category,
      previous_quantity: Number(record.previousQuantity),
      quantity_changed: Number(record.quantityChanged),
      new_quantity: Number(record.newQuantity),
      action_type: String(record.actionType || "").toUpperCase(),
      reason: record.reason || "",
      actor_name: record.user || "Unknown user",
      source_system: "GOOGLE_SHEETS"
    }));
    requireSuccess(await client.from("inventory_movements").upsert(rows, { onConflict: "movement_id" }), "Supabase inventory-history mirror");
    return { mirrored: true, count: rows.length };
  }

  async function mirrorPackingBatch({ batch, orders = [], summary = {}, verification = {} } = {}) {
    if (!active || !batch) return { mirrored: false, orders: 0 };
    requireSuccess(await client.from("packing_batches").upsert({
      batch_id: batch.batchId,
      created_at: batch.createdAt,
      status: batch.status,
      total_orders: Number(batch.totalOrders || summary.totalOrders || 0),
      processed_pages: Number(batch.processedPages || summary.totalOutputPages || 0),
      orders_needing_review: Number(batch.ordersNeedingReview || 0),
      confirmed_at: batch.confirmedAt || null,
      confirmed_by_name: batch.confirmedBy || null,
      verification_passed: Boolean(verification.passed),
      source_system: "PACKING_APP",
      updated_at: now()
    }, { onConflict: "batch_id" }), "Supabase packing-batch mirror");
    if (orders.length) {
      const rows = orders.map(order => ({
        batch_order_id: stableId("batch_order", [batch.batchId, order.orderId || order.trackingNumber || order.orderNumber]),
        batch_id: batch.batchId,
        order_key: order.orderId ? `order:${order.orderId}` : order.trackingNumber ? `tracking:${order.trackingNumber}` : stableId("content", [order.buyerId, JSON.stringify(order.products || [])]),
        order_id: order.orderId ? cleanPostgresText(order.orderId) : null,
        tracking_number: order.trackingNumber ? cleanPostgresText(order.trackingNumber) : null,
        packing_group: cleanPostgresText(order.finalGroup || order.exactPackingGroup || ""),
        needs_review: order.finalGroup === "Needs_Review" || order.exactPackingGroup === "Needs Review",
        order_data: sanitizePostgresJson(order)
      }));
      // Smaller writes are easier to retry and stay below API request-size limits
      // as packing runs grow into hundreds or thousands of orders.
      for (let index = 0; index < rows.length; index += 100) {
        requireSuccess(await client.from("packing_batch_orders").upsert(rows.slice(index, index + 100), { onConflict: "batch_order_id" }), "Supabase packing-order mirror");
      }
    }
    return { mirrored: true, orders: orders.length };
  }

  async function mirrorPackingActivity(log) {
    if (!active || !log) return { mirrored: false };
    const activityId = stableId("activity", [log.timestamp, log.batchId, log.orderId, log.worker, log.action]);
    requireSuccess(await client.from("packing_activity").upsert({
      activity_id: activityId,
      occurred_at: log.timestamp,
      batch_id: log.batchId,
      order_id: log.orderId,
      worker_name: log.worker,
      action: log.action,
      buyer_nickname: log.buyerNickname || "",
      packing_group: log.packingGroup || "",
      source_system: "GOOGLE_SHEETS"
    }, { onConflict: "activity_id" }), "Supabase packing-activity mirror");
    return { mirrored: true, activityId };
  }

  return { enabled: active, mirrorInventory, mirrorInventoryHistory, mirrorPackingBatch, mirrorPackingActivity };
}

module.exports = { stableId, requireSuccess, cleanPostgresText, sanitizePostgresJson, createSupabaseOperationsMirror };
