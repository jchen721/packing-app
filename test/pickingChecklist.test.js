const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareRows } = require("../pickingChecklist");

test("packing checklist uses physical item totals and resets worker checkboxes", () => {
  assert.deepEqual(prepareRows({
    "S&V Chasing Glory Together Booster Box (Chinese)": 1,
    "First Partner Illustration Collection (Series 3)": 3,
    "Ignored zero": 0
  }), [
    ["First Partner Illustration Collection (Series 3)", 3, false],
    ["S&V Chasing Glory Together Booster Box (Chinese)", 1, false]
  ]);
});
