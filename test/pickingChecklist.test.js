const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareRows } = require("../pickingChecklist");

test("packing checklist uses physical item totals and resets worker checkboxes", () => {
  assert.deepEqual(prepareRows({
    "S&V Chasing Glory Together Booster Box (Chinese)": 1,
    "First Partner - Series 3 Collection": 8,
    "First Partner Illustration Collection (Series 3)": 19,
    "Random Booster Pack (CN) x1": 30,
    "Random Chinese Booster Pack": 12,
    "Random Chinese Booster Pack x1": 7,
    "x1 Random Booster Pack (CN)": 43,
    "Pitch Black [Booster Pack] x1": 3,
    "Ignored zero": 0
  }), [
    ["First Partner Series 3 Collection", 27, false],
    ["Pitch Black Booster Pack", 3, false],
    ["Random Booster Pack (JP/KR/CN)", 92, false],
    ["S&V Chasing Glory Together Booster Box (Chinese)", 1, false]
  ]);
});
