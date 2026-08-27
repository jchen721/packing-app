const fs = require("fs");
const path = require("path");
const { stableId, requireSuccess } = require("./supabaseOperationsMirror");

const JSON_ARTIFACTS = new Set(["orders.json", "summary.json", "verification_report.json", "inventory_usage.json", "groupedOrders.json", "batch.json"]);

function contentType(fileName) {
  if (fileName.endsWith(".json")) return "application/json";
  if (fileName.endsWith(".pdf")) return "application/pdf";
  if (fileName.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

function safeFiles(runDir) {
  return fs.readdirSync(runDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && (JSON_ARTIFACTS.has(entry.name) || entry.name.toLowerCase().endsWith(".pdf")))
    .map(entry => path.join(runDir, entry.name));
}

function createSupabaseBatchStorage({ client, enabled = false, bucket = "packing-files", now = () => new Date().toISOString() } = {}) {
  const active = Boolean(client && enabled);

  async function uploadFile(localPath, objectPath) {
    const body = fs.readFileSync(localPath);
    const result = await client.storage.from(bucket).upload(objectPath, body, { contentType: contentType(localPath), upsert: true });
    requireSuccess(result, `Supabase upload ${path.basename(localPath)}`);
    return { objectPath, bytes: body.length, contentType: contentType(localPath) };
  }

  async function mirrorBatch({ batch, runDir, outputsDir }) {
    if (!active) return { mirrored: false, files: 0 };
    const prefix = `packing-batches/${batch.batchId}/${batch.runId}`;
    const localFiles = safeFiles(runDir);
    const zipPath = path.join(outputsDir, batch.zipFile);
    if (fs.existsSync(zipPath) && fs.statSync(zipPath).isFile()) localFiles.push(zipPath);
    const uploaded = [];
    for (const filePath of localFiles) uploaded.push(await uploadFile(filePath, `${prefix}/${path.basename(filePath)}`));
    const zip = uploaded.find(file => file.contentType === "application/zip") || null;
    requireSuccess(await client.from("packing_batch_runs").upsert({
      run_id: String(batch.runId),
      batch_id: batch.batchId,
      created_at: batch.createdAt,
      status: batch.status,
      zip_object_path: zip?.objectPath || null,
      artifact_count: uploaded.length,
      mirrored_at: now()
    }, { onConflict: "run_id" }), "Supabase packing-run mirror");
    const artifactRows = uploaded.map(file => ({
      artifact_id: stableId("artifact", [batch.batchId, batch.runId, file.objectPath]),
      batch_id: batch.batchId,
      run_id: String(batch.runId),
      object_path: file.objectPath,
      file_name: path.basename(file.objectPath),
      content_type: file.contentType,
      byte_size: file.bytes,
      created_at: now()
    }));
    if (artifactRows.length) requireSuccess(await client.from("packing_batch_artifacts").upsert(artifactRows, { onConflict: "artifact_id" }), "Supabase artifact-index mirror");
    return { mirrored: true, files: uploaded.length, zipStored: Boolean(zip) };
  }

  async function createSignedZipUrl(batchId, expiresInSeconds = 300) {
    if (!active) return null;
    const query = await client.from("packing_batch_runs").select("zip_object_path,created_at").eq("batch_id", batchId).not("zip_object_path", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    requireSuccess(query, "Supabase packing ZIP lookup");
    if (!query.data?.zip_object_path) return null;
    const signed = await client.storage.from(bucket).createSignedUrl(query.data.zip_object_path, expiresInSeconds);
    requireSuccess(signed, "Supabase packing ZIP signed URL");
    return signed.data?.signedUrl || null;
  }

  return { enabled: active, mirrorBatch, createSignedZipUrl };
}

module.exports = { JSON_ARTIFACTS, contentType, safeFiles, createSupabaseBatchStorage };
