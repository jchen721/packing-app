const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { analyzePackingStorage } = require("../packingStorage");

test("packing storage reports local runs, generated files, ZIPs, and disk capacity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "packing-storage-"));
  const run = path.join(root, "123"); fs.mkdirSync(run);
  fs.writeFileSync(path.join(run, "batch.json"), Buffer.alloc(20));
  fs.writeFileSync(path.join(root, "packing_output_123.zip"), Buffer.alloc(30));
  const fsImpl = { ...fs, statfsSync() { return { bsize: 1024, bavail: 200, blocks: 1000 }; } };
  const result = analyzePackingStorage(root, { fsImpl, warningBytes: 100, minimumFreeBytes: 100000 });
  assert.equal(result.totalBytes, 50);
  assert.equal(result.fileCount, 2);
  assert.equal(result.zipCount, 1);
  assert.equal(result.runDirectoryCount, 1);
  assert.equal(result.freeBytes, 204800);
  assert.equal(result.diskSizeBytes, 1024000);
  assert.equal(result.status, "HEALTHY");
});

test("packing storage warns on output growth and critically low free space", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "packing-storage-warning-"));
  fs.writeFileSync(path.join(root, "large.zip"), Buffer.alloc(101));
  const warningFs = { ...fs, statfsSync() { return { bsize: 1, bavail: 1000, blocks: 2000 }; } };
  const warning = analyzePackingStorage(root, { fsImpl: warningFs, warningBytes: 100, minimumFreeBytes: 500 });
  assert.equal(warning.status, "WARNING");
  assert.equal(warning.warnings.length, 1);

  const criticalFs = { ...fs, statfsSync() { return { bsize: 1, bavail: 10, blocks: 2000 }; } };
  const critical = analyzePackingStorage(root, { fsImpl: criticalFs, warningBytes: 100, minimumFreeBytes: 500 });
  assert.equal(critical.status, "CRITICAL");
  assert.equal(critical.warnings.length, 2);
});

test("packing storage never follows symbolic links outside outputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "packing-storage-link-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "packing-storage-outside-"));
  fs.writeFileSync(path.join(outside, "private.bin"), Buffer.alloc(500));
  fs.symlinkSync(outside, path.join(root, "external"));
  const result = analyzePackingStorage(root, { fsImpl: fs, warningBytes: 100, minimumFreeBytes: 0 });
  assert.equal(result.totalBytes, 0);
  assert.equal(result.fileCount, 0);
  assert.equal(result.runDirectoryCount, 0);
});
