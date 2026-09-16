const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { buildInventoryUsageFromOrders, convertUsageToArray } = require("./buildInventoryUsage");

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function createBatchId(orders) {
  const auditData = orders.map(order => ({
    orderId: order.orderId,
    trackingNumber: order.trackingNumber,
    exactPackingGroup: order.exactPackingGroup,
    inventoryPackingGroup: order.inventoryPackingGroup,
    products: order.products
  })).sort((a, b) => {
    const aKey = `${a.orderId || ""}:${a.trackingNumber || ""}`;
    const bKey = `${b.orderId || ""}:${b.trackingNumber || ""}`;
    return aKey.localeCompare(bKey);
  });

  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalize(auditData)))
    .digest("hex");
}

function createOrderKey(order) {
  const orderId = String(order.orderId || "").trim();
  if (orderId) return `order:${orderId}`;
  const tracking = String(order.trackingNumber || "").trim();
  if (tracking) return `tracking:${tracking}`;
  return `content:${crypto.createHash("sha256").update(JSON.stringify(canonicalize({
    buyerId: order.buyerId,
    products: order.products
  }))).digest("hex")}`;
}

function splitUsage(orders, usage) {
  const products = [];
  const boxes = [];
  for (const entry of usage) {
    (/ Boxes$/.test(entry.item) ? boxes : products).push(entry);
  }
  return { products, boxes };
}

function createBatchManifest({ runId, orders, summary, verification, zipPath }) {
  const batchId = createBatchId(orders);
  const usage = convertUsageToArray(buildInventoryUsageFromOrders(orders));
  const groupedOrders = {};

  for (const order of orders) {
    if (!groupedOrders[order.finalGroup]) groupedOrders[order.finalGroup] = [];
    groupedOrders[order.finalGroup].push(order);
  }

  const categorized = splitUsage(orders, usage);
  const batch = {
    batchId,
    runId,
    createdAt: new Date().toISOString(),
    status: "awaiting_inventory_confirmation",
    zipFile: path.basename(zipPath),
    totalOrders: orders.length,
    processedPages: verification.totalOutputPages,
    ordersNeedingReview: orders.filter(order => order.finalGroup === "Needs_Review").length,
    orderKeys: [...new Set(orders.map(createOrderKey))]
  };

  return { batch, usage, groupedOrders, categorized, summary, verification };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function saveBatchFiles(outputDir, manifest, orders) {
  writeJson(path.join(outputDir, "orders.json"), orders);
  writeJson(path.join(outputDir, "summary.json"), manifest.summary);
  writeJson(path.join(outputDir, "verification_report.json"), manifest.verification);
  writeJson(path.join(outputDir, "inventory_usage.json"), manifest.usage);
  writeJson(path.join(outputDir, "groupedOrders.json"), manifest.groupedOrders);
  writeJson(path.join(outputDir, "batch.json"), manifest.batch);
}

function readCompleteBatch(runDir) {
  const requiredFiles = ["batch.json", "orders.json", "summary.json", "verification_report.json", "inventory_usage.json", "groupedOrders.json"];
  const values = {};
  try {
    for (const fileName of requiredFiles) values[fileName] = JSON.parse(fs.readFileSync(path.join(runDir, fileName), "utf8"));
  } catch {
    return null;
  }
  const batch = values["batch.json"];
  if (!batch || !/^[a-f0-9]{64}$/.test(String(batch.batchId || ""))) return null;
  if (!Array.isArray(values["orders.json"]) || !Array.isArray(values["inventory_usage.json"])) return null;
  if (!values["summary.json"] || typeof values["summary.json"] !== "object") return null;
  if (!values["verification_report.json"] || typeof values["verification_report.json"] !== "object") return null;
  if (!values["groupedOrders.json"] || typeof values["groupedOrders.json"] !== "object" || Array.isArray(values["groupedOrders.json"])) return null;
  return { batch, orders: values["orders.json"] };
}

function findBatch(outputsDir, batchId) {
  if (!fs.existsSync(outputsDir)) return null;
  const candidates = [];
  const runDirs = fs.readdirSync(outputsDir);
  for (const runId of runDirs) {
    const runDir = path.join(outputsDir, runId);
    let stat;
    try { stat = fs.statSync(runDir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const complete = readCompleteBatch(runDir);
    if (!complete || (batchId && complete.batch.batchId !== batchId)) continue;
    const createdTime = new Date(complete.batch.createdAt || "").getTime();
    candidates.push({ ...complete, runDir, sortTime: Number.isFinite(createdTime) ? createdTime : stat.mtimeMs });
  }
  candidates.sort((a, b) => b.sortTime - a.sortTime || String(b.batch.runId || "").localeCompare(String(a.batch.runId || "")));
  if (!candidates.length) return null;
  const { sortTime, ...found } = candidates[0];
  return found;
}

function readBatchReview(outputsDir, batchId) {
  const found = findBatch(outputsDir, batchId);
  if (!found) throw new Error("Packing batch was not found.");
  const read = name => JSON.parse(fs.readFileSync(path.join(found.runDir, name), "utf8"));
  const orders = read("orders.json");
  const usage = read("inventory_usage.json");
  const orderKeys = found.batch.orderKeys || [...new Set(orders.map(createOrderKey))];
  return { ...found.batch, orderKeys, ...splitUsage(orders, usage), proposedDeductions: usage };
}

module.exports = { createBatchId, createOrderKey, createBatchManifest, saveBatchFiles, readCompleteBatch, findBatch, readBatchReview };
