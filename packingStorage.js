const fs = require("fs");
const path = require("path");

function finiteBytes(value) {
  const number = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function analyzePackingStorage(outputsDir, {
  fsImpl = fs,
  warningBytes = 10 * 1024 ** 3,
  minimumFreeBytes = 5 * 1024 ** 3
} = {}) {
  const result = {
    outputsDir: path.resolve(outputsDir), totalBytes: 0, fileCount: 0, zipCount: 0, runDirectoryCount: 0,
    oldestFileAt: null, newestFileAt: null, freeBytes: null, diskSizeBytes: null,
    warningBytes, minimumFreeBytes, status: "HEALTHY", warnings: []
  };
  if (!fsImpl.existsSync(outputsDir)) return result;

  const rootEntries = fsImpl.readdirSync(outputsDir, { withFileTypes: true });
  result.runDirectoryCount = rootEntries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).length;
  const pending = rootEntries.map(entry => path.join(outputsDir, entry.name));
  while (pending.length) {
    const current = pending.pop();
    let stat;
    try { stat = fsImpl.lstatSync(current); } catch { continue; }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      let children = [];
      try { children = fsImpl.readdirSync(current); } catch { continue; }
      pending.push(...children.map(name => path.join(current, name)));
      continue;
    }
    if (!stat.isFile()) continue;
    result.fileCount += 1;
    result.totalBytes += Number(stat.size) || 0;
    if (path.extname(current).toLowerCase() === ".zip") result.zipCount += 1;
    const modified = new Date(stat.mtimeMs).toISOString();
    if (!result.oldestFileAt || modified < result.oldestFileAt) result.oldestFileAt = modified;
    if (!result.newestFileAt || modified > result.newestFileAt) result.newestFileAt = modified;
  }

  if (typeof fsImpl.statfsSync === "function") {
    try {
      const disk = fsImpl.statfsSync(outputsDir);
      const blockSize = finiteBytes(disk.bsize);
      const availableBlocks = finiteBytes(disk.bavail);
      const totalBlocks = finiteBytes(disk.blocks);
      if (blockSize !== null && availableBlocks !== null) result.freeBytes = blockSize * availableBlocks;
      if (blockSize !== null && totalBlocks !== null) result.diskSizeBytes = blockSize * totalBlocks;
    } catch { /* Storage totals remain available even when filesystem capacity cannot be read. */ }
  }

  if (result.freeBytes !== null && result.freeBytes < minimumFreeBytes) {
    result.status = "CRITICAL";
    result.warnings.push("This computer is below the configured free-disk safety level. Archive reviewed packing outputs before processing another large run.");
  }
  if (result.totalBytes >= warningBytes) {
    if (result.status === "HEALTHY") result.status = "WARNING";
    result.warnings.push("Generated packing files exceed the configured storage warning level. Review a management-approved archive policy.");
  }
  return result;
}

module.exports = { finiteBytes, analyzePackingStorage };
