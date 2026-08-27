const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { getFinalGroup, listPrintablePackingFiles, createZip } = require("../pdfProcessor");

test("7x5x5 keeps the existing consolidated small-box PDF workflow", () => {
  assert.equal(getFinalGroup("7x5x5"), "6_Box");
});

function readZipEntryNames(buffer) {
  const names = [];
  const centralDirectorySignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let offset = 0;
  while ((offset = buffer.indexOf(centralDirectorySignature, offset)) !== -1) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names.sort();
}

test("worker ZIP contains printable PDFs and excludes internal batch JSON", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "packing-worker-zip-"));
  try {
    fs.writeFileSync(path.join(root, "6_Box.pdf"), "printable-six");
    fs.writeFileSync(path.join(root, "Needs_Review.pdf"), "printable-review");
    fs.writeFileSync(path.join(root, "batch.json"), "{}");
    fs.writeFileSync(path.join(root, "orders.json"), "[]");
    fs.writeFileSync(path.join(root, "inventory_usage.json"), "[]");

    assert.deepEqual(listPrintablePackingFiles(root), ["6_Box.pdf", "Needs_Review.pdf"]);

    const zipPath = path.join(root, "packing.zip");
    await createZip(root, zipPath);
    assert.deepEqual(readZipEntryNames(fs.readFileSync(zipPath)), ["6_Box.pdf", "Needs_Review.pdf"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
