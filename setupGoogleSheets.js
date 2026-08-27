const { getSheetsClient, SPREADSHEET_ID } = require("./googleInventoryManager");
const { OPERATIONS_SCHEMAS, createSchemaService } = require("./googleSheetsSchema");

async function main() {
  const operations = createSchemaService({ getSheetsClient, spreadsheetId: SPREADSHEET_ID, schemas: OPERATIONS_SCHEMAS });
  const operationsResults = await operations.ensureAll();
  for (const result of operationsResults) console.log(`Operations / ${result.title}: ${result.status}`);
  console.log("Spreadsheet layout: packing and inventory operations only.");
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Google Sheets setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
