const path = require("path");
const { google } = require("googleapis");

const SPREADSHEET_ID =
  "18rq0z5nE5KCsHKGCY6al-UMXmpceN5c5LXZ3tA8ejGA";

const SHEET_NAME = "packing List";

const SERVICE_ACCOUNT_FILE = path.join(
  __dirname,
  "google-service-account.json"
);

function prepareRows(itemCountsPhysical) {
  if (!itemCountsPhysical || typeof itemCountsPhysical !== "object") {
    throw new Error("No physical item counts were provided.");
  }

  return Object.entries(itemCountsPhysical)
    .filter(([item, amount]) => {
      return (
        String(item).trim() !== "" &&
        Number.isFinite(Number(amount)) &&
        Number(amount) > 0
      );
    })
    .map(([item, amount]) => [
      String(item).trim(),
      Number(amount),
      false
    ])
    .sort((a, b) =>
      a[0].localeCompare(b[0], undefined, {
        sensitivity: "base"
      })
    );
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({
    version: "v4",
    auth
  });
}

async function getSheetId(sheets) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties"
  });

  const sheet = response.data.sheets.find(
    currentSheet => currentSheet.properties.title === SHEET_NAME
  );

  if (!sheet) {
    throw new Error(`Google Sheet tab "${SHEET_NAME}" was not found.`);
  }

  return sheet.properties.sheetId;
}

async function updatePickingChecklist(itemCountsPhysical) {
  const rows = prepareRows(itemCountsPhysical);
  const sheets = await getSheetsClient();
  const sheetId = await getSheetId(sheets);

  if (rows.length === 0) {
    throw new Error("There are no valid items to write.");
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!A:C`
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 2,
              endColumnIndex: 3
            },
            rule: null
          }
        }
      ]
    }
  });

  const values = [
    ["ITEM", "QUANTITY", "CHECKLIST"],
    ...rows
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!A1:C${values.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values
    }
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: values.length,
              startColumnIndex: 2,
              endColumnIndex: 3
            },
            rule: {
              condition: {
                type: "BOOLEAN"
              },
              strict: true,
              showCustomUi: true
            }
          }
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 3
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true
                }
              }
            },
            fields: "userEnteredFormat.textFormat.bold"
          }
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: 3
            }
          }
        }
      ]
    }
  });

  console.log(
    `Packing checklist updated with ${rows.length} different items.`
  );

  return {
    success: true,
    itemCount: rows.length
  };
}

module.exports = {
  updatePickingChecklist
};