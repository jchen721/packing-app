const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

async function splitByPackingGroup() {
  const inputPdfBytes = fs.readFileSync("sample.pdf");
  const orders = JSON.parse(fs.readFileSync("test_orders.json", "utf8"));

  const inputPdf = await PDFDocument.load(inputPdfBytes);

  if (!fs.existsSync("outputs")) {
    fs.mkdirSync("outputs");
  }

  const groups = {};

  for (const order of orders) {
    const group = order.packingGroup || "Needs Review";

    if (!groups[group]) {
      groups[group] = [];
    }

    groups[group].push(order);
  }

  for (const [groupName, groupOrders] of Object.entries(groups)) {
    const newPdf = await PDFDocument.create();

    for (const order of groupOrders) {
      const pagesToCopy = [order.labelPage, order.packingSlipPage];

      for (const pageIndex of pagesToCopy) {
        if (pageIndex >= 0 && pageIndex < inputPdf.getPageCount()) {
          const [copiedPage] = await newPdf.copyPages(inputPdf, [pageIndex]);
          newPdf.addPage(copiedPage);
        }
      }
    }

    const safeName = groupName.replace(/[^a-z0-9]/gi, "_");
    const outputPath = path.join("outputs", `${safeName}.pdf`);

    const pdfBytes = await newPdf.save();
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`Created ${outputPath} with ${groupOrders.length} orders`);
  }
}

splitByPackingGroup().catch(console.error);