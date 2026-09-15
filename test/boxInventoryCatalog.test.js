const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BOX_CATALOG,
  BOX_INVENTORY_SHEET_NAME,
  canonicalTrackedPackingSupplyName,
  createBoxCatalogService
} = require("../boxInventoryCatalog");

function fakeSheets(existingRows = []) {
  const appended = [];
  return {
    appended,
    client: {
      spreadsheets: {
        values: {
          async get({ range }) {
            assert.match(range, new RegExp(BOX_INVENTORY_SHEET_NAME));
            return { data: { values: existingRows } };
          },
          async append({ requestBody }) {
            appended.push(...requestBody.values);
          }
        }
      }
    }
  };
}

test("box catalog includes every tracked size without adding unnecessary metadata", () => {
  const byItem = new Map(BOX_CATALOG.map(box => [box.item, box]));
  assert.deepEqual(byItem.get("7x5x5 Boxes"), { item: "7x5x5 Boxes", unitCost: 0.29 });
  assert.deepEqual(byItem.get("24x12x4 Boxes"), { item: "24x12x4 Boxes", unitCost: 1.54 });
  assert.deepEqual(byItem.get("24x12x6 Boxes"), { item: "24x12x6 Boxes", unitCost: 1.33 });
  assert.equal(new Set(BOX_CATALOG.map(box => box.item)).size, BOX_CATALOG.length);
});

test("legacy supply labels resolve to the Box Inventory source-of-truth names", () => {
  assert.equal(canonicalTrackedPackingSupplyName("8x8x4"), "8x8x4 Boxes");
  assert.equal(canonicalTrackedPackingSupplyName("8 * 8 * 4 box"), "8x8x4 Boxes");
  assert.equal(canonicalTrackedPackingSupplyName("Bubble Mailer "), "Bubble Mailers");
  assert.equal(canonicalTrackedPackingSupplyName("Bubble Wrap"), "Bubble Wrap Pieces");
  assert.equal(canonicalTrackedPackingSupplyName("Mega Charizard UPC"), null);
});

test("box catalog setup appends only missing rows with blank starting quantities", async () => {
  const fake = fakeSheets([["6x6x6 Boxes", 90]]);
  const service = createBoxCatalogService({ getSheetsClient: async () => fake.client, spreadsheetId: "sheet" });
  const result = await service.seedMissingRows();
  assert.equal(result.added, BOX_CATALOG.length - 1);
  assert.equal(fake.appended.some(row => row[0] === "6x6x6 Boxes"), false);
  assert.ok(fake.appended.every(row => row.length === 6 && row[1] === "" && row[2] === "" && row[3] === ""));
});
