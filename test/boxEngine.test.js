const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyProduct, chooseBox } = require("../boxEngine");

function counts(overrides = {}) {
  return { normalPacks: 0, sleevedPacks: 0, etbs: 0, tins: 0, posters: 0, pokemonDays: 0, firstPartners: 0, megaItems: 0, largePremiums: 0, boosterBoxes: 0, japaneseBoosterBoxes: 0, boosterBundles: 0, collectionBoxes: 0, victiniCollections: 0, deluxePin: 0, box24: 0, unknown: 0, ...overrides };
}

test("existing product classification remains intact", () => {
  assert.equal(classifyProduct("Perfect Order ETB"), "etbs");
  assert.equal(classifyProduct("Random Booster Pack"), "normalPacks");
  assert.equal(classifyProduct("Unrecognized Product"), "unknown");
});

test("all booster bundle set names use the existing bundle size", () => {
  assert.equal(classifyProduct("Chaos Rising Booster Bundle"), "boosterBundles");
  assert.equal(classifyProduct("Destined Rival Booster Bundle"), "boosterBundles");
  assert.equal(classifyProduct("Future Set Booster Bundles"), "boosterBundles");
  assert.equal(chooseBox(counts({ boosterBundles: 1 })), "6x6x6");
});

test("one standard booster box uses the temporary 7x5x5 rule", () => {
  assert.equal(classifyProduct("S&V Chasing Glory Together Booster Box (Chinese)"), "boosterBoxes");
  assert.equal(classifyProduct("Future Set Booster Box"), "boosterBoxes");
  assert.equal(chooseBox(counts({ boosterBoxes: 1 })), "7x5x5");
  assert.equal(chooseBox(counts({ boosterBoxes: 2 })), "Needs Review");
  assert.equal(chooseBox(counts({ boosterBoxes: 1, etbs: 2 })), "Needs Review");
});

test("one Japanese booster box uses the manager-approved 8x8x4 rule", () => {
  assert.equal(classifyProduct("Japanese Night Wanderer Booster Box"), "japaneseBoosterBoxes");
  assert.equal(classifyProduct("JP Future Set Booster Box"), "japaneseBoosterBoxes");
  assert.equal(chooseBox(counts({ japaneseBoosterBoxes: 1 })), "8x8x4");
  assert.equal(chooseBox(counts({ japaneseBoosterBoxes: 2 })), "Needs Review");
});

test("unapproved booster display products still need review", () => {
  assert.equal(classifyProduct("Japanese Booster Display Box"), "unknown");
  assert.equal(chooseBox(counts({ unknown: 1 })), "Needs Review");
});

test("First Partner Series 2 and 3 collections use Pokemon Day box behavior", () => {
  assert.equal(classifyProduct("First Partner Illustration Collection (Series 3)"), "firstPartners");
  assert.equal(classifyProduct("First Partner - Series 2 Collection"), "firstPartners");
  assert.equal(classifyProduct("First Partner - Series 3 Collection"), "firstPartners");
  assert.equal(chooseBox(counts({ firstPartners: 1 })), "8x8x4");
  assert.equal(chooseBox(counts({ firstPartners: 2 })), "8x8x4");
  assert.equal(chooseBox(counts({ firstPartners: 3 })), "8x8x4");
  assert.equal(chooseBox(counts({ firstPartners: 2, etbs: 1 })), "8x8x8");
  assert.equal(chooseBox(counts({ firstPartners: 1, normalPacks: 3, tins: 1 })), "8x8x4");
  assert.equal(chooseBox(counts({ firstPartners: 1, etbs: 2 })), "11x11x5");
  assert.equal(chooseBox(counts({ firstPartners: 2, etbs: 2 })), "11x11x5");
});

test("Legendary Warriors and Unova Heavy Hitters use the Blooming Waters 24 family", () => {
  assert.equal(classifyProduct("Legendary Warriors Premium Collection"), "box24");
  assert.equal(classifyProduct("Unova Premium Collection - Heavy Hitters"), "box24");
  assert.equal(chooseBox(counts({ box24: 2 })), "24x12x4");
  assert.equal(chooseBox(counts({ box24: 2, etbs: 1 })), "24x12x6");
});

test("Ascended Heroes Focused Fighters uses the approved 24 Box family", () => {
  assert.equal(classifyProduct("Ascended Heroes Focused Fighters Premium Collection"), "box24");
  assert.equal(chooseBox(counts({ box24: 1 })), "24x12x4");
  assert.equal(chooseBox(counts({ box24: 1, normalPacks: 3 })), "24x12x4");
});

test("an ETB adds height to a long 24-series product", () => {
  assert.equal(classifyProduct("Blooming Waters 151 Premium Collection"), "box24");
  assert.equal(chooseBox(counts({ box24: 1, etbs: 1 })), "24x12x6");
  assert.equal(chooseBox(counts({ box24: 1, etbs: 3 })), "24x12x6");
});

test("Mega Zygarde uses the existing 16-box family", () => {
  assert.equal(classifyProduct("Mega Zygarde ex Premium Collection"), "largePremiums");
  assert.equal(chooseBox(counts({ largePremiums: 1 })), "16x12x4");
  assert.equal(chooseBox(counts({ largePremiums: 1, etbs: 1 })), "16x12x6");
});

test("letters inside another word do not classify a product as a tin", () => {
  assert.equal(classifyProduct("Destined Rival Celebration"), "unknown");
});

test("existing box selection rules remain intact", () => {
  assert.equal(chooseBox(counts({ etbs: 1 })), "8x8x4");
  assert.equal(chooseBox(counts({ etbs: 4 })), "12x12x12");
  assert.equal(chooseBox(counts({ tins: 3 })), "6x6x6");
  assert.equal(chooseBox(counts({ unknown: 1 })), "Needs Review");
});

test("manager ETB and poster ladder uses the new exact box sizes", () => {
  assert.equal(chooseBox(counts({ etbs: 2, boosterBundles: 1 })), "11x11x7");
  assert.equal(chooseBox(counts({ etbs: 3 })), "11x11x7");
  assert.equal(chooseBox(counts({ posters: 1 })), "11x11x3");
  assert.equal(chooseBox(counts({ posters: 2 })), "11x11x5");
  assert.equal(chooseBox(counts({ posters: 1, etbs: 1 })), "11x11x5");
  assert.equal(chooseBox(counts({ posters: 2, etbs: 1 })), "11x11x7");
  assert.equal(chooseBox(counts({ posters: 1, etbs: 3 })), "11x11x9");
  assert.equal(chooseBox(counts({ posters: 1, etbs: 4 })), "12x12x12");
  assert.equal(chooseBox(counts({ etbs: 5 })), "12x12x12");
  assert.equal(chooseBox(counts({ etbs: 6 })), "16x12x8");
  assert.equal(chooseBox(counts({ etbs: 7 })), "Needs Review");
});

test("manager collection and premium ladders use explicit quantity combinations", () => {
  assert.equal(classifyProduct("Future Set Collection Box"), "collectionBoxes");
  assert.equal(chooseBox(counts({ collectionBoxes: 1 })), "16x12x4");
  assert.equal(chooseBox(counts({ collectionBoxes: 1, etbs: 1 })), "13x10x6");
  assert.equal(chooseBox(counts({ collectionBoxes: 1, etbs: 2 })), "16x12x6");
  assert.equal(chooseBox(counts({ collectionBoxes: 1, largePremiums: 1 })), "16x12x6");
  assert.equal(chooseBox(counts({ largePremiums: 2 })), "16x12x8");
  assert.equal(chooseBox(counts({ largePremiums: 1, etbs: 2 })), "16x12x8");
  assert.equal(chooseBox(counts({ largePremiums: 3 })), "16x12x12");
  assert.equal(chooseBox(counts({ largePremiums: 2, etbs: 2 })), "16x12x12");
});

test("two Victini collection boxes use the approved 13x10x4 rule", () => {
  assert.equal(classifyProduct("Victini Illustration Collection Box"), "victiniCollections");
  assert.equal(chooseBox(counts({ victiniCollections: 2 })), "13x10x4");
  assert.equal(chooseBox(counts({ victiniCollections: 1 })), "Needs Review");
});
