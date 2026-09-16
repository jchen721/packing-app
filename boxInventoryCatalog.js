const BOX_INVENTORY_SHEET_NAME = "Box Inventory";

const BOX_INVENTORY_HEADERS = Object.freeze([
  "Item",
  "Quantity",
  "Low Stock Level",
  "Reorder Amount",
  "Unit Cost",
  "Notes"
]);

const BOX_CATALOG = Object.freeze([
  { item: "6x6x6 Boxes", unitCost: 0.33 },
  { item: "7x5x5 Boxes", unitCost: 0.29 },
  { item: "8x8x4 Boxes", unitCost: 0.50 },
  { item: "8x8x8 Boxes", unitCost: 0.48 },
  { item: "11x11x3 Boxes", unitCost: "", notes: "Eliminated by the warehouse; retained only so stale batches cannot silently skip this supply." },
  { item: "11x11x5 Boxes", unitCost: 1.02 },
  { item: "11x11x7 Boxes", unitCost: 1.12 },
  { item: "11x11x9 Boxes", unitCost: 1.17 },
  { item: "12x12x12 Boxes", unitCost: 0.94, notes: "Not currently assigned by the packing engine." },
  { item: "13x10x4 Boxes", unitCost: 0.62 },
  { item: "13x10x6 Boxes", unitCost: 0.91 },
  { item: "13x10x8 Boxes", unitCost: "", notes: "Used by the packing engine; unit cost not yet provided." },
  { item: "16x12x4 Boxes", unitCost: 0.79 },
  { item: "16x12x6 Boxes", unitCost: 0.80 },
  { item: "16x12x8 Boxes", unitCost: 0.88 },
  { item: "16x12x12 Boxes", unitCost: 0.96, notes: "Not currently assigned by the packing engine." },
  { item: "18x18x12 Boxes", unitCost: "", notes: "Starting quantity not yet provided; not currently assigned by the packing engine." },
  { item: "24x12x4 Boxes", unitCost: 1.54 },
  { item: "24x12x6 Boxes", unitCost: 1.33 },
  { item: "Bubble Mailers", unitCost: "", notes: "Starting quantity 1,500 equals 3 cases of 500 mailers." },
  { item: "Bubble Wrap Pieces", unitCost: "", notes: "Starting quantity 1,750 equals 5 rolls of 350 pieces." }
]);

function catalogRow(box) {
  return [box.item, "", "", "", box.unitCost, box.notes || ""];
}

function createBoxCatalogService({ getSheetsClient, spreadsheetId }) {
  async function seedMissingRows() {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${BOX_INVENTORY_SHEET_NAME}'!A2:F`
    });
    const existing = new Set((response.data.values || [])
      .map(row => String(row[0] || "").trim().toLowerCase())
      .filter(Boolean));
    const missing = BOX_CATALOG.filter(box => !existing.has(box.item.toLowerCase()));
    if (missing.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${BOX_INVENTORY_SHEET_NAME}'!A:F`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: missing.map(catalogRow) }
      });
    }
    return { added: missing.length, existing: BOX_CATALOG.length - missing.length, total: BOX_CATALOG.length };
  }

  return { seedMissingRows };
}

function isTrackedPackingSupply(item) {
  return Boolean(canonicalTrackedPackingSupplyName(item));
}

function canonicalTrackedPackingSupplyName(item) {
  const clean = String(item || "").trim().replace(/\s+/g, " ");
  if (!clean) return null;
  const direct = BOX_CATALOG.find(box => box.item.toLowerCase() === clean.toLowerCase());
  if (direct) return direct.item;

  const dimensions = clean.match(/^(\d+)\s*[x×*]\s*(\d+)\s*[x×*]\s*(\d+)(?:\s+box(?:es)?)?$/i);
  if (dimensions) {
    const dimensionName = `${dimensions[1]}x${dimensions[2]}x${dimensions[3]} Boxes`;
    return BOX_CATALOG.find(box => box.item.toLowerCase() === dimensionName.toLowerCase())?.item || null;
  }
  if (/^bubble\s+mailer(?:s)?$/i.test(clean)) return "Bubble Mailers";
  if (/^bubble\s+wrap(?:\s+pieces?)?$/i.test(clean)) return "Bubble Wrap Pieces";
  return null;
}

module.exports = {
  BOX_INVENTORY_SHEET_NAME,
  BOX_INVENTORY_HEADERS,
  BOX_CATALOG,
  catalogRow,
  createBoxCatalogService,
  canonicalTrackedPackingSupplyName,
  isTrackedPackingSupply
};
