const SUPPLY_PATTERNS = [
  /^(?:\d+x\d+x\d+|\d+)\s*(?:boxes?)?$/i,
  /\bboxes$/i,
  /\b(?:top loaders?|bubble mailers?|shipping mailers?|packing tape|shipping labels?|thermal labels?|bubble wrap|packing paper|void fill)\b/i
];

const PRODUCT_PATTERNS = [
  /\betb\b|elite trainer/i,
  /\bbooster (?:pack|bundle|box)/i,
  /\bmini tin\b/i,
  /\bpok[eé]mon\b/i,
  /\bpremium collection\b|\bupc\b|ultra[ -]?premium/i,
  /\bex box\b/i
];

function expectedInventoryCategory(itemName) {
  const name = String(itemName || "").trim();
  if (!name) return null;
  if (SUPPLY_PATTERNS.some(pattern => pattern.test(name))) return "Warehouse Supplies";
  if (PRODUCT_PATTERNS.some(pattern => pattern.test(name))) return "Pokémon Products";
  return null;
}

function recommendedInventoryName(itemName) {
  const name = String(itemName || "").trim();
  if (/^\d+(?:x\d+x\d+)?$/i.test(name)) return `${name} Boxes`;
  return name;
}

function auditInventoryCatalog(inventory = []) {
  const issues = inventory.flatMap(item => {
    const expectedCategory = expectedInventoryCategory(item.item);
    const actualCategory = String(item.category || "").trim();
    const expectedItemName = recommendedInventoryName(item.item);
    const categoryMismatch = Boolean(expectedCategory && actualCategory && expectedCategory !== actualCategory);
    const nameMismatch = expectedItemName !== String(item.item || "").trim();
    if (!categoryMismatch && !nameMismatch) return [];
    return [{
      item: item.item,
      expectedItemName,
      currentCategory: actualCategory,
      expectedCategory: expectedCategory || actualCategory,
      currentSheet: item.sheetName || (actualCategory === "Warehouse Supplies" ? "Warehouse Supplies" : "Inventory"),
      expectedSheet: (expectedCategory || actualCategory) === "Warehouse Supplies" ? "Warehouse Supplies" : "Inventory",
      categoryMismatch,
      nameMismatch
    }];
  });
  return { ready: issues.length === 0, issueCount: issues.length, issues };
}

module.exports = { expectedInventoryCategory, recommendedInventoryName, auditInventoryCatalog };
