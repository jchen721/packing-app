const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { Duplex } = require("node:stream");
const { IncomingMessage, ServerResponse } = require("node:http");
const app = require("../server");

function decodeResponse(raw) {
  const divider = raw.indexOf("\r\n\r\n");
  const head = raw.slice(0, divider);
  let body = raw.slice(divider + 4);
  if (/transfer-encoding:\s*chunked/i.test(head)) {
    let decoded = "";
    while (body) {
      const lineEnd = body.indexOf("\r\n");
      const size = Number.parseInt(body.slice(0, lineEnd), 16);
      if (!size) break;
      decoded += body.slice(lineEnd + 2, lineEnd + 2 + size);
      body = body.slice(lineEnd + 2 + size + 2);
    }
    body = decoded;
  }
  return { status: Number(head.match(/^HTTP\/1.1\s+(\d+)/)?.[1]), body };
}

async function inject({ method = "GET", url = "/", body = "", headers = {} } = {}) {
  const output = [];
  const socket = new Duplex({ read() {}, write(chunk, encoding, callback) { output.push(Buffer.from(chunk)); callback(); } });
  socket.remoteAddress = "127.0.0.1";
  const request = new IncomingMessage(socket);
  request.method = method;
  request.url = url;
  request.headers = { host: "localhost", ...headers };
  const response = new ServerResponse(request);
  response.assignSocket(socket);
  const finished = once(response, "finish");
  app(request, response);
  process.nextTick(() => { if (body) request.push(Buffer.from(body)); request.push(null); });
  await finished;
  return decodeResponse(Buffer.concat(output).toString("utf8"));
}

test("route layer rejects unsafe or incomplete packing requests before shared writes", async () => {
  assert.equal((await inject({ url: "/batches/not-a-batch" })).status, 400);
  const body = JSON.stringify({ user: "QA" });
  assert.equal((await inject({ url: "/batches/not-a-batch/confirm", method: "POST", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body })).status, 400);
  const noFiles = await inject({ url: "/process", method: "POST" });
  assert.equal(noFiles.status, 400);
  assert.equal(noFiles.body, "No PDFs uploaded.");
});

test("removed livestream and AI routes are unavailable", async () => {
  for (const url of ["/live-stream-analytics", "/live-sets", "/set-builder/recommendations", "/ai-analyst/status", "/tiktok-integration/status"]) {
    const response = await inject({ url });
    assert.equal(response.status, 404, url);
    assert.match(JSON.parse(response.body).error, /simplified packing and inventory app/i);
  }
});

test("packing-only mode blocks every permanent inventory mutation", async () => {
  const validBatch = "a".repeat(64);
  const confirmBody = JSON.stringify({ user: "QA" });
  const confirmation = await inject({ url: `/batches/${validBatch}/confirm`, method: "POST", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(confirmBody)) }, body: confirmBody });
  assert.equal(confirmation.status, 503);
  assert.match(JSON.parse(confirmation.body).error, /inventory changes are disabled/i);

  const receiptBody = JSON.stringify({ items: [{ item: "Test", quantity: 1 }], user: "QA" });
  const receipt = await inject({ url: "/inventory/receive/preview", method: "POST", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(receiptBody)) }, body: receiptBody });
  assert.equal(receipt.status, 503);
  assert.match(JSON.parse(receipt.body).error, /receiving inventory is disabled/i);

  const reconciliation = await inject({ url: "/inventory/reconciliation/confirm", method: "POST", headers: { "content-type": "application/json", "content-length": "2" }, body: "{}" });
  assert.equal(reconciliation.status, 503);
  assert.match(JSON.parse(reconciliation.body).error, /inventory changes are disabled/i);
});

test("Supabase status never exposes server secrets", async () => {
  const response = await inject({ url: "/supabase/status" });
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, /BEGIN PRIVATE KEY|sb_secret_|service_role_key_value/i);
});

test("packing storage route remains read-only", async () => {
  const response = await inject({ url: "/packing-storage" });
  assert.equal(response.status, 200);
  const data = JSON.parse(response.body);
  assert.ok(Number.isFinite(data.totalBytes));
  assert.ok(["HEALTHY", "WARNING", "CRITICAL"].includes(data.status));
});
