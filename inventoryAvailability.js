function buildInventoryAvailability(usage = [], inventory = []) {
  const inventoryMap = new Map(inventory.map(item => [String(item.item || "").trim().toLowerCase(), item]));
  return usage.filter(row => row && String(row.item || "").trim() && Number(row.quantity) > 0).map(row => {
    const item = String(row.item).trim();
    const quantity = Number(row.quantity);
    const current = inventoryMap.get(item.toLowerCase());
    if (!current) return { item, quantity, category: "", currentQuantity: null, newQuantity: null, status: "MISSING" };
    const newQuantity = Number(current.quantity || 0) - quantity;
    return {
      item: current.item,
      quantity,
      category: current.category || "",
      currentQuantity: Number(current.quantity || 0),
      newQuantity,
      status: newQuantity < 0 ? "INSUFFICIENT" : "READY"
    };
  });
}

function assertInventoryAvailability(rows) {
  const missing = rows.filter(row => row.status === "MISSING");
  if (missing.length) throw new Error(`These items were not found in Inventory or Warehouse Supplies: ${missing.map(row => row.item).join(", ")}`);
  const insufficient = rows.filter(row => row.status === "INSUFFICIENT");
  if (insufficient.length) throw new Error(`Inventory is insufficient for: ${insufficient.map(row => `${row.item} (stock ${row.currentQuantity}, required ${row.quantity})`).join(", ")}. Update the shared sheet or correct the packing batch before confirming.`);
  return true;
}

module.exports = { buildInventoryAvailability, assertInventoryAvailability };
