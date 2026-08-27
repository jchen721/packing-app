const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_FILES = ["index.html", "worker.html"];

function readPublicFile(name) {
  return fs.readFileSync(path.join(__dirname, "..", "public", name), "utf8");
}

test("public interfaces avoid unsafe HTML injection sinks and contain parseable inline scripts", () => {
  for (const name of PUBLIC_FILES) {
    const source = readPublicFile(name);
    assert.doesNotMatch(source, /\.innerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/, name);
    const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
    for (const script of scripts) assert.doesNotThrow(() => new Function(script), `${name} contains invalid inline JavaScript`);
  }
});

test("manager interface exposes only packing and inventory sections", () => {
  const source = readPublicFile("index.html");
  assert.match(source, /data-section="packing"/);
  assert.match(source, /data-section="inventory"/);
  assert.doesNotMatch(source, /data-section="(?:live|setBuilder|analyst|forecast)/i);
});
