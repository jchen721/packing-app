const test = require("node:test");
const assert = require("node:assert/strict");
const { getFinalGroup } = require("../pdfProcessor");

test("7x5x5 keeps the existing consolidated small-box PDF workflow", () => {
  assert.equal(getFinalGroup("7x5x5"), "6_Box");
});
