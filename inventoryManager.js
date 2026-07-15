const XLSX = require("xlsx");
const fs = require("fs");

const INVENTORY_FILE = "./inventory.xlsx";
const SHEET_NAME = "Inventory";

function createInventoryFileIfMissing() {
  if (fs.existsSync(INVENTORY_FILE)) return;

  const starterInventory = [
    { Item: "Chaos Rising Packs", Quantity: 0 },
    { Item: "Gem Packs", Quantity: 0 },
    { Item: "Top Loaders", Quantity: 0 },
    { Item: "Bubble Mailers", Quantity: 0 },
    { Item: "8x8x4 Boxes", Quantity: 0 },
    { Item: "8x8x8 Boxes", Quantity: 0 },
    { Item: "11x11x5 Boxes", Quantity: 0 },
    { Item: "11x11x7 Boxes", Quantity: 0 },
    { Item: "11x11x9 Boxes", Quantity: 0 },
    { Item: "16x12x4 Boxes", Quantity: 0 },
    { Item: "16x12x6 Boxes", Quantity: 0 },
    { Item: "16x12x8 Boxes", Quantity: 0 }
  ];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(starterInventory);

  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  XLSX.writeFile(workbook, INVENTORY_FILE);

  console.log("Created inventory.xlsx");
}

function readInventory() {
  createInventoryFileIfMissing();

  const workbook = XLSX.readFile(INVENTORY_FILE);
  const sheet = workbook.Sheets[SHEET_NAME];

  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in inventory.xlsx`);
  }

  return XLSX.utils.sheet_to_json(sheet);
}

function saveInventory(inventory) {
  const workbook = XLSX.readFile(INVENTORY_FILE);
  const sheet = XLSX.utils.json_to_sheet(inventory);

  workbook.Sheets[SHEET_NAME] = sheet;
  XLSX.writeFile(workbook, INVENTORY_FILE);
}

function subtractInventory(itemsUsed) {
  const inventory = readInventory();
  const notFound = [];

  for (const used of itemsUsed) {
    const itemName = used.item;
    const quantityUsed = Number(used.quantity);

    const row = inventory.find(
      item => String(item.Item).trim().toLowerCase() === itemName.trim().toLowerCase()
    );

    if (!row) {
      notFound.push(itemName);
      continue;
    }

    row.Quantity = Number(row.Quantity || 0) - quantityUsed;
  }

  saveInventory(inventory);

  return {
    success: true,
    notFound,
    inventory
  };
}

function getInventory() {
  return readInventory();
}

module.exports = {
  subtractInventory,
  getInventory
};