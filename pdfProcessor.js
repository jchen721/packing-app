const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const { PDFDocument } = require("pdf-lib");

let archiver = require("archiver");
if (archiver.default) archiver = archiver.default;

const { classifyProduct, chooseBox } = require("./boxEngine");

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function parseProducts(rawProducts) {
  const text = String(rawProducts || "")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\n+/g, "\n");

  const products = [];

  // Supports both old and new formats:
  // Old: Default 1 3
  // New: Default 1 $22.00 3
  // Also supports: Default $0.00 1
  const pattern = /([\s\S]*?)\s+Default([^\n]*)(?=\n|$)/g;

  let match;

  while ((match = pattern.exec(text)) !== null) {
    const productName = cleanText(match[1]);

    const afterDefault = cleanText(match[2]).replace(
      /\$\d+(?:\.\d{2})?/g,
      " "
    );

    const nums = afterDefault.match(/\d+/g) || [];

    let pdfQty = 1;

    if (nums.length >= 2) {
      pdfQty = Number(nums[nums.length - 1]);
    } else if (nums.length === 1) {
      pdfQty = Number(nums[0]);
    }

    if (!productName) continue;

    let physicalQty = pdfQty;

    const multiplierStart = productName.match(/^(\d+)x\s+/i);
    const multiplierEnd = productName.match(/\sx(\d+)$/i);

    if (multiplierStart) {
      physicalQty = pdfQty * Number(multiplierStart[1]);
    } else if (multiplierEnd) {
      physicalQty = pdfQty * Number(multiplierEnd[1]);
    }

    products.push({
      productName,
      category: classifyProduct(productName),
      pdfQty,
      physicalQty
    });
  }

  return products;
}

function countCategories(products) {
  const counts = {
    normalPacks: 0,
    sleevedPacks: 0,
    etbs: 0,
    tins: 0,
    posters: 0,
    pokemonDays: 0,
    megaItems: 0,
    largePremiums: 0,
    deluxePin: 0,
    box24: 0,
    unknown: 0
  };

  for (const product of products) {
    counts[product.category] += product.pdfQty;
  }

  return counts;
}

function getBuyerNickname(pageText, buyerId) {
  const nickname =
    pageText.match(/Buyer Nickname:\s*([\s\S]*?)(?:\n|$)/)?.[1] || "";

  if (nickname.trim()) return cleanText(nickname);

  return cleanText(buyerId || "");
}

function getFinalGroup(exactGroup) {
  if (exactGroup === "8x8x4") return "8x8x4";
  if (exactGroup === "8x8x8") return "8x8x8";

  if (exactGroup.startsWith("6x")) return "6_Box";
  if (exactGroup.startsWith("11x")) return "11_Box";
  if (exactGroup.startsWith("13x")) return "13_Box";
  if (exactGroup.startsWith("16x")) return "16_Box";
  if (exactGroup.includes("24")) return "24_Box";

  if (exactGroup === "Packs Only") return "Packs_Only";
  if (exactGroup === "Sleeved Packs") return "Sleeved_Packs";
  if (exactGroup === "Needs Review") return "Needs_Review";

  return "Needs_Review";
}

function sortByNickname(groupItems) {
  return groupItems.sort((a, b) => {
    const nameA = cleanText(a.order.buyerNickname).toLowerCase();
    const nameB = cleanText(b.order.buyerNickname).toLowerCase();

    return nameA.localeCompare(nameB);
  });
}

function addToCounts(counts, products, usePhysical = false) {
  for (const product of products) {
    const qty = usePhysical ? product.physicalQty : product.pdfQty;
    counts[product.productName] = (counts[product.productName] || 0) + qty;
  }
}

function buildSummaryText(groupName, groupItems, itemCounts, physicalItemCounts) {
  const nicknames = groupItems
    .map(item => item.order.buyerNickname)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const itemLines = Object.entries(itemCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, qty]) => `${name}: ${qty}`)
    .join("\n");

  const physicalLines = Object.entries(physicalItemCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, qty]) => `${name}: ${qty}`)
    .join("\n");

  return [
    `${groupName} SUMMARY`,
    "",
    `Total Orders: ${groupItems.length}`,
    "",
    "Items Needed:",
    itemLines || "None",
    "",
    "Physical Item Counts:",
    physicalLines || "None",
    "",
    "Nicknames A-Z:",
    ...nicknames
  ].join("\n");
}

async function createZip(sourceDir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function processPDFs(filePaths) {
  const runId = Date.now().toString();
  const outputDir = path.join("outputs", runId);

  fs.mkdirSync(outputDir, { recursive: true });

  const allOrders = [];
  const groupedOrders = {};
  const itemCounts = {};
  const itemCountsPhysical = {};

  const verification = {
    totalInputFiles: filePaths.length,
    totalInputPages: 0,
    totalOutputPages: 0,
    expectedOutputPages: 0,
    missingPages: [],
    duplicatePages: [],
    files: [],
    inputPagesMatchOutput: false,
    detectedOrdersMatchPages: false,
    passed: false
  };

  const pageTracker = new Map();
  let globalOrderNumber = 1;

  for (const filePath of filePaths) {
    const pdfBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    const inputPdf = await PDFDocument.load(pdfBuffer);

    const fileName = path.basename(filePath);
    const inputPageCount = inputPdf.getPageCount();

    verification.totalInputPages += inputPageCount;

    const fileReport = {
      fileName,
      inputPageCount,
      ordersFound: 0,
      expectedPagesUsed: 0
    };

    const pages = result.text
      .split(/-- \d+ of \d+ --/)
      .filter(p => p.trim());

    let localOrderIndex = 0;

    for (const pageText of pages) {
      if (!pageText.includes("Product Name")) continue;

      const trackingNumber =
        pageText.match(/Tracking\s*number:\s*(\d+)/)?.[1] || null;

      const orderId = pageText.match(/Order ID:\s*(\d+)/)?.[1] || null;

      const buyerId = pageText.match(/Buyer ID:\s*([^\s]+)/)?.[1] || null;

      const buyerNickname = getBuyerNickname(pageText, buyerId);

      const slipQtyTotal =
        Number(pageText.match(/Qty Total:\s*(\d+)/)?.[1] || 0);

      const rawProducts =
        pageText.match(
          /Product Name\s+SKU\s+Seller SKU(?:\s+SKU Price\s+\(Unit\))?\s+Qty\s+([\s\S]*?)Qty Total:/
        )?.[1] || "";

      const products = parseProducts(rawProducts);

      const parsedPdfQtyTotal = products.reduce((sum, p) => sum + p.pdfQty, 0);
      const parsedPhysicalQtyTotal = products.reduce(
        (sum, p) => sum + p.physicalQty,
        0
      );

      const quantityMatches = parsedPdfQtyTotal === slipQtyTotal;
      const categoryCounts = countCategories(products);

      let exactPackingGroup = chooseBox(categoryCounts);

      if (!quantityMatches || products.length === 0) {
        exactPackingGroup = "Needs Review";
      }

      const finalGroup = getFinalGroup(exactPackingGroup);

      addToCounts(itemCounts, products, false);
      addToCounts(itemCountsPhysical, products, true);

      const labelPage = localOrderIndex * 2;
      const packingSlipPage = localOrderIndex * 2 + 1;

      const order = {
        orderNumber: globalOrderNumber,
        sourceFile: fileName,
        labelPage,
        packingSlipPage,
        trackingNumber,
        orderId,
        buyerId,
        buyerNickname,
        slipQtyTotal,
        parsedPdfQtyTotal,
        parsedPhysicalQtyTotal,
        quantityMatches,
        exactPackingGroup,
        finalGroup,
        categoryCounts,
        products
      };

      allOrders.push(order);

      if (!groupedOrders[finalGroup]) {
        groupedOrders[finalGroup] = [];
      }

      groupedOrders[finalGroup].push({
        order,
        inputPdf,
        sourceFile: fileName
      });

      for (const pageIndex of [labelPage, packingSlipPage]) {
        const pageKey = `${fileName}::${pageIndex}`;

        if (pageTracker.has(pageKey)) {
          verification.duplicatePages.push({
            fileName,
            pageIndex,
            orderId
          });
        }

        pageTracker.set(pageKey, {
          fileName,
          pageIndex,
          orderId,
          finalGroup
        });
      }

      fileReport.ordersFound++;
      fileReport.expectedPagesUsed += 2;

      localOrderIndex++;
      globalOrderNumber++;
    }

    verification.files.push(fileReport);
  }

  for (const [groupName, groupItemsRaw] of Object.entries(groupedOrders)) {
    const groupItems = sortByNickname(groupItemsRaw);
    const newPdf = await PDFDocument.create();

    const groupItemCounts = {};
    const groupPhysicalCounts = {};

    for (const item of groupItems) {
      addToCounts(groupItemCounts, item.order.products, false);
      addToCounts(groupPhysicalCounts, item.order.products, true);

      const { order, inputPdf } = item;

      for (const pageIndex of [order.labelPage, order.packingSlipPage]) {
        if (pageIndex >= 0 && pageIndex < inputPdf.getPageCount()) {
          const [copiedPage] = await newPdf.copyPages(inputPdf, [pageIndex]);
          newPdf.addPage(copiedPage);
          verification.totalOutputPages++;
        }
      }
    }

    const pdfPath = path.join(outputDir, `${groupName}.pdf`);
    const summaryPath = path.join(outputDir, `${groupName}_summary.txt`);

    const pdfBytes = await newPdf.save();
    fs.writeFileSync(pdfPath, pdfBytes);

    fs.writeFileSync(
      summaryPath,
      buildSummaryText(
        groupName,
        groupItems,
        groupItemCounts,
        groupPhysicalCounts
      )
    );
  }

  for (const fileReport of verification.files) {
    verification.expectedOutputPages += fileReport.expectedPagesUsed;

    for (let i = 0; i < fileReport.inputPageCount; i++) {
      const pageKey = `${fileReport.fileName}::${i}`;

      if (!pageTracker.has(pageKey)) {
        verification.missingPages.push({
          fileName: fileReport.fileName,
          pageIndex: i
        });
      }
    }
  }

  verification.inputPagesMatchOutput =
    verification.totalInputPages === verification.totalOutputPages;

  verification.detectedOrdersMatchPages =
    verification.totalInputPages === verification.expectedOutputPages;

  verification.passed =
    verification.missingPages.length === 0 &&
    verification.duplicatePages.length === 0 &&
    verification.totalOutputPages === verification.expectedOutputPages &&
    verification.inputPagesMatchOutput &&
    verification.detectedOrdersMatchPages;

  const summary = {
    totalOrders: allOrders.length,
    totalInputFiles: verification.totalInputFiles,
    totalInputPages: verification.totalInputPages,
    expectedOutputPages: verification.expectedOutputPages,
    totalOutputPages: verification.totalOutputPages,
    verificationPassed: verification.passed,
    inputPagesMatchOutput: verification.inputPagesMatchOutput,
    detectedOrdersMatchPages: verification.detectedOrdersMatchPages,
    groups: Object.fromEntries(
      Object.entries(groupedOrders).map(([group, orders]) => [
        group,
        orders.length
      ])
    )
  };

  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, "verification_report.json"),
    JSON.stringify(verification, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, "orders.json"),
    JSON.stringify(allOrders, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, "itemCounts.json"),
    JSON.stringify(itemCounts, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, "itemCountsPhysical.json"),
    JSON.stringify(itemCountsPhysical, null, 2)
  );

  if (!verification.passed) {
    throw new Error(
      `Verification failed. Input pages: ${verification.totalInputPages}, Output pages: ${verification.totalOutputPages}, Expected pages: ${verification.expectedOutputPages}. Missing pages: ${verification.missingPages.length}, Duplicate pages: ${verification.duplicatePages.length}`
    );
  }

  const zipPath = path.join("outputs", `packing_output_${runId}.zip`);

  await createZip(outputDir, zipPath);

  return {
    zipPath,
    summary
  };
}

module.exports = {
  processPDFs
};