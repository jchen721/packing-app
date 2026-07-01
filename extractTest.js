const fs = require("fs");
const { PDFParse } = require("pdf-parse");
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
  const pattern = /([\s\S]*?)\s+Default\s+1(?:\s+(\d+))?(?=\n|$)/g;

  let match;

  while ((match = pattern.exec(text)) !== null) {
    const productName = cleanText(match[1]);
    let pdfQty = match[2] ? Number(match[2]) : 1;

    if (!productName) continue;

    let physicalQty = pdfQty;

    const multiplier = productName.match(/^(\d+)x\s+/i);
    if (multiplier) {
      physicalQty = pdfQty * Number(multiplier[1]);
    }

    products.push({
      productName,
      category: classifyProduct(productName),
      pdfQty,
      physicalQty
    });
  }

  // Fallback for lines like: Default 2
  if (products.length === 0 && text.includes("Default")) {
    const fallbackMatch = text.match(/([\s\S]*?)\s+Default\s+(\d+)\s*$/);

    if (fallbackMatch) {
      const productName = cleanText(fallbackMatch[1]);
      const pdfQty = Number(fallbackMatch[2]);

      products.push({
        productName,
        category: classifyProduct(productName),
        pdfQty,
        physicalQty: pdfQty
      });
    }
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
    unknown: 0
  };

  for (const product of products) {
    counts[product.category] += product.pdfQty;
  }

  return counts;
}

async function run() {
  const pdfBuffer = fs.readFileSync("sample.pdf");

  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();

  const text = result.text;
  const pages = text.split(/-- \d+ of \d+ --/).filter(p => p.trim());

  const orders = [];
  const badOrders = [];
  const groupedOrders = {};
  const itemCountsPdf = {};
  const itemCountsPhysical = {};

  let orderIndex = 0;

  for (const pageText of pages) {
    if (!pageText.includes("Product Name")) continue;

    const trackingNumber =
      pageText.match(/Tracking\s*number:\s*(\d+)/)?.[1] || null;

    const orderId =
      pageText.match(/Order ID:\s*(\d+)/)?.[1] || null;

    const buyerId =
      pageText.match(/Buyer ID:\s*([^\s]+)/)?.[1] || null;

    const slipQtyTotal =
      Number(pageText.match(/Qty Total:\s*(\d+)/)?.[1] || 0);

    const rawProducts =
      pageText.match(
        /Product Name\s+SKU\s+Seller SKU\s+Qty\s+([\s\S]*?)Qty Total:/
      )?.[1] || "";

    const products = parseProducts(rawProducts);

    const parsedPdfQtyTotal = products.reduce((sum, p) => sum + p.pdfQty, 0);
    const parsedPhysicalQtyTotal = products.reduce((sum, p) => sum + p.physicalQty, 0);

    const quantityMatches = parsedPdfQtyTotal === slipQtyTotal;
    const categoryCounts = countCategories(products);

    let packingGroup = chooseBox(categoryCounts);

    if (!quantityMatches || products.length === 0) {
      packingGroup = "Needs Review";
    }

    for (const product of products) {
      itemCountsPdf[product.productName] =
        (itemCountsPdf[product.productName] || 0) + product.pdfQty;

      itemCountsPhysical[product.productName] =
        (itemCountsPhysical[product.productName] || 0) + product.physicalQty;
    }

    const order = {
      orderNumber: orderIndex + 1,
      labelPage: orderIndex * 2,
      packingSlipPage: orderIndex * 2 + 1,
      trackingNumber,
      orderId,
      buyerId,
      slipQtyTotal,
      parsedPdfQtyTotal,
      parsedPhysicalQtyTotal,
      quantityMatches,
      packingGroup,
      categoryCounts,
      products,
      rawProducts: rawProducts.trim()
    };

    orders.push(order);

    if (!groupedOrders[packingGroup]) {
      groupedOrders[packingGroup] = [];
    }

    groupedOrders[packingGroup].push(order);

    if (!quantityMatches || products.length === 0) {
      badOrders.push(order);
    }

    orderIndex++;
  }

  fs.writeFileSync("test_orders.json", JSON.stringify(orders, null, 2));
  fs.writeFileSync("test_badOrders.json", JSON.stringify(badOrders, null, 2));
  fs.writeFileSync("groupedOrders.json", JSON.stringify(groupedOrders, null, 2));
  fs.writeFileSync("itemCounts.json", JSON.stringify(itemCountsPdf, null, 2));
  fs.writeFileSync("itemCountsPhysical.json", JSON.stringify(itemCountsPhysical, null, 2));

  console.log(`Orders found: ${orders.length}`);
  console.log(`Bad orders: ${badOrders.length}`);
  console.log("Saved test_orders.json");
  console.log("Saved test_badOrders.json");
  console.log("Saved groupedOrders.json");
  console.log("Saved itemCounts.json");
  console.log("Saved itemCountsPhysical.json");
}

run().catch(console.error);