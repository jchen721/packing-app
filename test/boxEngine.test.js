const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyProduct, chooseBox } = require("../boxEngine");

function counts(overrides = {}) {
  return { normalPacks: 0, sleevedPacks: 0, etbs: 0, tins: 0, posters: 0, pokemonDays: 0, firstPartners: 0, megaItems: 0, largePremiums: 0, boosterBoxes: 0, deluxePin: 0, box24: 0, unknown: 0, ...overrides };
}

test("existing product classification remains intact", () => {
  assert.equal(classifyProduct("Perfect Order ETB"), "etbs");
  assert.equal(classifyProduct("Random Booster Pack"), "normalPacks");
  assert.equal(classifyProduct("Unrecognized Product"), "unknown");
});

test("all booster bundle set names use the existing bundle size", () => {
  assert.equal(classifyProduct("Chaos Rising Booster Bundle"), "tins");
  assert.equal(classifyProduct("Destined Rival Booster Bundle"), "tins");
  assert.equal(classifyProduct("Future Set Booster Bundles"), "tins");
  assert.equal(chooseBox(counts({ tins: 1 })), "6x6x6");
});

test("one standard booster box uses the temporary 7x5x5 rule", () => {
  assert.equal(classifyProduct("S&V Chasing Glory Together Booster Box (Chinese)"), "boosterBoxes");
  assert.equal(classifyProduct("Future Set Booster Box"), "boosterBoxes");
  assert.equal(chooseBox(counts({ boosterBoxes: 1 })), "7x5x5");
  assert.equal(chooseBox(counts({ boosterBoxes: 2 })), "Needs Review");
  assert.equal(chooseBox(counts({ boosterBoxes: 1, etbs: 2 })), "Needs Review");
});

test("unapproved booster display products still need review", () => {
  assert.equal(classifyProduct("Japanese Booster Display Box"), "unknown");
  assert.equal(chooseBox(counts({ unknown: 1 })), "Needs Review");
});

test("First Partner Series 3 collections use Pokemon Day box behavior", () => {
  assert.equal(classifyProduct("First Partner Illustration Collection (Series 3)"), "firstPartners");
  assert.equal(classifyProduct("First Partner - Series 3 Collection"), "firstPartners");
  assert.equal(chooseBox(counts({ firstPartners: 1 })), "8x8x4");
  assert.equal(chooseBox(counts({ firstPartners: 1, normalPacks: 3, tins: 1 })), "8x8x4");
  assert.equal(chooseBox(counts({ firstPartners: 1, etbs: 2 })), "11x11x5");
  assert.equal(chooseBox(counts({ firstPartners: 2, etbs: 2 })), "Needs Review");
});

test("Ascended Heroes Focused Fighters uses the approved 24 Box family", () => {
  assert.equal(classifyProduct("Ascended Heroes Focused Fighters Premium Collection"), "box24");
  assert.equal(chooseBox(counts({ box24: 1 })), "24 Box");
  assert.equal(chooseBox(counts({ box24: 1, normalPacks: 3 })), "24 Box");
});

test("Mega Zygarde uses the existing 16-box family", () => {
  assert.equal(classifyProduct("Mega Zygarde ex Premium Collection"), "largePremiums");
  assert.equal(chooseBox(counts({ largePremiums: 1 })), "16x12x4");
  assert.equal(chooseBox(counts({ largePremiums: 1, etbs: 1 })), "16x12x6");
});

test("letters inside another word do not classify a product as a tin", () => {
  assert.equal(classifyProduct("Destined Rival Collection"), "unknown");
});

test("existing box selection rules remain intact", () => {
  assert.equal(chooseBox(counts({ etbs: 1 })), "8x8x4");
  assert.equal(chooseBox(counts({ etbs: 4 })), "16x12x8");
  assert.equal(chooseBox(counts({ tins: 3 })), "6x6x6");
  assert.equal(chooseBox(counts({ unknown: 1 })), "Needs Review");
});
