/*
Change the value on the right to match the item name
you use in the Google Sheet.

Items not listed here keep their original product name.
*/
const PRODUCT_NAME_MAP = {
  "Perfect Order Sleeved Booster Pack - ME03: Perfect Order":
    "Perfect Order Sleeved Booster Pack",

  "2x Chaos Rising English Booster Pack":
    "Chaos Rising Packs",

  "Chaos Rising Booster Pack":
    "Chaos Rising Packs",

  "Prismatic Tin (Random Art/Could be different from what's show on screen)":
    "Prismatic Tin",

  "Mega Charizard Ultra Premium Collection (UPC)":
    "Mega Charizard UPC",

  "Random Booster Pack (JP/KR/CN)":
    "Random Booster Pack (JP/KR/CN)",

  "x1 Random Booster Pack":
    "Random Booster Pack (JP/KR/CN)",

  "Gem 4 Booster Pack":
    "Gem Packs",

  "Gem 4 Booster Pack x1":
    "Gem Packs",

  "Ascended Heroes - Mega Emboar ex Box":
    "Ascended Heroes Mega Emboar ex Box",

  "Ascended Heroes Mega Emboar ex Box":
    "Ascended Heroes Mega Emboar ex Box",

  "Lumiose City Mini Tin (Random Art)":
    "Lumiose City Mini Tin",

  "Lumiose City Mini Tin":
    "Lumiose City Mini Tin"
};

function normalizeProductName(originalName) {
  const cleaned = String(originalName || "").trim().replace(/\s+/g, " ");
  const comparable = cleaned.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (/\brandom\s+booster\s+pack\b/i.test(comparable)) return "Random Booster Pack (JP/KR/CN)";
  if (/\bgem(?:\s+vol)?\s*4(?:\s+booster)?\s+pack(?:\s+x1)?\b/i.test(comparable)) return "Gem Packs";
  if (/\bchaos\s+rising(?:\s+english)?\s+booster\s+pack(?:\s+x1)?\b/i.test(comparable)) return "Chaos Rising Packs";
  const match = Object.entries(PRODUCT_NAME_MAP).find(
    ([alias]) => alias.toLowerCase() === cleaned.toLowerCase()
  );
  return match ? match[1] : cleaned;
}

/*
Maps packing groups to the box names in the inventory sheet.
Each order in one of these groups uses one box.
*/
const BOX_GROUP_MAP = {
  "6x6x6": "6x6x6 Boxes",
  "7x5x5": "7x5x5 Boxes",
  "8x8x4": "8x8x4 Boxes",
  "8x8x8": "8x8x8 Boxes",
  "11x11x5": "11x11x5 Boxes",
  "11x11x7": "11x11x7 Boxes",
  "11x11x9": "11x11x9 Boxes",
  "13x10x4": "13x10x4 Boxes",
  "13x10x6": "13x10x6 Boxes",
  "13x10x8": "13x10x8 Boxes",
  "16x12x4": "16x12x4 Boxes",
  "16x12x6": "16x12x6 Boxes",
  "16x12x8": "16x12x8 Boxes",
  "24 Box": "24 Boxes"
};

function buildInventoryUsageFromOrders(orders) {
  if (!Array.isArray(orders)) {
    throw new Error("Orders must be an array.");
  }

  const usage = {};

  for (const order of orders) {
    for (const product of order.products || []) {
      const originalName = String(product.productName || "").trim();
      const inventoryName = normalizeProductName(originalName);
      addUsage(usage, inventoryName, product.physicalQty);
    }

    const normalizedGroup = normalizePackingGroup(order.exactPackingGroup);
    const matchingGroup = Object.keys(BOX_GROUP_MAP).find(
      boxGroup => normalizePackingGroup(boxGroup) === normalizedGroup
    );

    if (matchingGroup) {
      addUsage(usage, BOX_GROUP_MAP[matchingGroup], 1);
    }
  }

  return usage;
}

function addUsage(usage, itemName, quantity) {
  const cleanName = String(itemName || "").trim();
  const cleanQuantity = Number(quantity);

  if (
    !cleanName ||
    !Number.isFinite(cleanQuantity) ||
    cleanQuantity <= 0
  ) {
    return;
  }

  usage[cleanName] = (usage[cleanName] || 0) + cleanQuantity;
}

function normalizePackingGroup(groupName) {
  return String(groupName || "")
    .toLowerCase()
    .replace(/[×]/g, "x")
    .replace(/\s+/g, "")
    .replace(/boxes?/g, "");
}

function convertUsageToArray(usage) {
  return Object.entries(usage).map(([item, quantity]) => ({
    item,
    quantity
  }));
}

module.exports = {
  buildInventoryUsageFromOrders,
  convertUsageToArray,
  normalizeProductName
};
