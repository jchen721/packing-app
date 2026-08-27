const test = require("node:test");
const assert = require("node:assert/strict");
const { boundedNumber, booleanSetting, resolveSpreadsheetIds } = require("../appConfig");

test("bounded numeric configuration rejects invalid and empty values", () => {
  assert.equal(boundedNumber("not-a-number", 15, { min: 5, max: 60 }), 15);
  assert.equal(boundedNumber("", 15, { min: 5, max: 60 }), 15);
  assert.equal(boundedNumber(undefined, 15, { min: 5, max: 60 }), 15);
});

test("bounded numeric configuration enforces limits and whole numbers", () => {
  assert.equal(boundedNumber("2", 15, { min: 5, max: 60 }), 5);
  assert.equal(boundedNumber("100", 15, { min: 5, max: 60 }), 60);
  assert.equal(boundedNumber("18.9", 15, { min: 5, max: 60 }), 18);
  assert.equal(boundedNumber("18.9", 15, { min: 5, max: 60, integer: false }), 18.9);
});

test("only the operations spreadsheet is configured", () => {
  assert.deepEqual(resolveSpreadsheetIds({ GOOGLE_SPREADSHEET_ID: " operations " }), { operations: "operations" });
  assert.deepEqual(resolveSpreadsheetIds({ GOOGLE_SPREADSHEET_ID: "operations", GOOGLE_LIVESTREAM_SPREADSHEET_ID: "ignored" }), { operations: "operations" });
});

test("boolean settings fail closed on unknown values", () => {
  assert.equal(booleanSetting("true"), true);
  assert.equal(booleanSetting("OFF", true), false);
  assert.equal(booleanSetting("unexpected"), false);
});
