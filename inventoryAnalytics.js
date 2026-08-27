const SUPPLY_TERMS = ["mailer", "top loader", "packing tape", "shipping label", "bubble wrap", "packing paper"];

function inventoryCategory(item) {
  const explicit = String(item.category || "").trim();
  if (explicit) return explicit;
  const name = String(item.item || "").toLowerCase();
  const shippingBox = /^(?:\d+x\d+x\d+|\d+) boxes?$/.test(name);
  return shippingBox || SUPPLY_TERMS.some(term => name.includes(term)) ? "Warehouse Supplies" : "Pokémon Products";
}

function enrichInventory(inventory) {
  return inventory.map(item => ({
    ...item,
    category: inventoryCategory(item),
    stockStatus: item.quantity <= 0 ? "Out of stock" : item.lowStockLevel > 0 && item.quantity <= item.lowStockLevel ? "Low stock" : "In stock"
  }));
}

function summarizeInventory(inventory) {
  const items = enrichInventory(inventory);
  return {
    totalItems: items.length,
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
    lowStockItems: items.filter(item => item.stockStatus === "Low stock").length,
    outOfStockItems: items.filter(item => item.stockStatus === "Out of stock").length,
    items
  };
}

module.exports = { inventoryCategory, enrichInventory, summarizeInventory };
