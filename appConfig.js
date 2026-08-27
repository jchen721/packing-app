const path = require("path");

const DEFAULT_SPREADSHEET_ID = "18rq0z5nE5KCsHKGCY6al-UMXmpceN5c5LXZ3tA8ejGA";
const credentialsSetting = process.env.GOOGLE_CREDENTIALS_FILE || "google-service-account.json";

function textSetting(value, fallback = "") {
  const cleaned = String(value ?? "").trim();
  return cleaned || fallback;
}

function resolveSpreadsheetIds(environment = process.env) {
  const operations = textSetting(environment.GOOGLE_SPREADSHEET_ID, DEFAULT_SPREADSHEET_ID);
  return { operations };
}

const spreadsheetIds = resolveSpreadsheetIds();

function boundedNumber(value, fallback, { min = -Infinity, max = Infinity, integer = true } = {}) {
  const parsed = String(value ?? "").trim() === "" ? NaN : Number(value);
  const usable = Number.isFinite(parsed) ? parsed : fallback;
  const bounded = Math.min(max, Math.max(min, usable));
  return integer ? Math.floor(bounded) : bounded;
}

function booleanSetting(value, fallback = false) {
  const cleaned = String(value ?? "").trim().toLowerCase();
  if (!cleaned) return fallback;
  if (["true", "1", "yes", "on"].includes(cleaned)) return true;
  if (["false", "0", "no", "off"].includes(cleaned)) return false;
  return fallback;
}

function resolveSupabaseSettings(environment = process.env) {
  const url = textSetting(environment.SUPABASE_URL);
  const publishableKey = textSetting(environment.SUPABASE_PUBLISHABLE_KEY || environment.SUPABASE_ANON_KEY);
  const secretKey = textSetting(environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY);
  const enabled = booleanSetting(environment.SUPABASE_ENABLED, false);
  const databaseMirrorEnabled = enabled && booleanSetting(environment.SUPABASE_DATABASE_MIRROR_ENABLED, false);
  const storageMirrorRequested = enabled && booleanSetting(environment.SUPABASE_STORAGE_MIRROR_ENABLED, false);
  return {
    enabled,
    url,
    publishableKey,
    secretKey,
    configured: enabled && /^https:\/\//i.test(url) && Boolean(publishableKey) && Boolean(secretKey),
    databaseMirrorEnabled,
    storageMirrorEnabled: databaseMirrorEnabled && storageMirrorRequested,
    storageMirrorRequiresDatabase: storageMirrorRequested && !databaseMirrorEnabled,
    authEnabled: enabled && booleanSetting(environment.SUPABASE_AUTH_ENABLED, false),
    storageBucket: textSetting(environment.SUPABASE_PACKING_BUCKET, "packing-files")
  };
}

const supabase = resolveSupabaseSettings();

module.exports = Object.freeze({
  boundedNumber,
  booleanSetting,
  textSetting,
  resolveSpreadsheetIds,
  resolveSupabaseSettings,
  port: boundedNumber(process.env.PORT, 3000, { min: 1, max: 65535 }),
  host: String(process.env.HOST || "127.0.0.1").trim(),
  spreadsheetId: spreadsheetIds.operations,
  credentialsFile: path.isAbsolute(credentialsSetting) ? credentialsSetting : path.join(__dirname, credentialsSetting),
  maxUploadFiles: boundedNumber(process.env.MAX_UPLOAD_FILES, 20, { min: 1, max: 500 }),
  maxUploadBytesPerFile: boundedNumber(process.env.MAX_UPLOAD_BYTES_PER_FILE, 50 * 1024 * 1024, { min: 1024 * 1024, max: 500 * 1024 * 1024 }),
  packingStorageWarningBytes: boundedNumber(process.env.PACKING_STORAGE_WARNING_BYTES, 10 * 1024 ** 3, { min: 100 * 1024 ** 2, max: 10 * 1024 ** 4 }),
  minimumFreeDiskBytes: boundedNumber(process.env.MINIMUM_FREE_DISK_BYTES, 5 * 1024 ** 3, { min: 100 * 1024 ** 2, max: 10 * 1024 ** 4 }),
  operationRecoveryMinimumMinutes: boundedNumber(process.env.OPERATION_RECOVERY_MINIMUM_MINUTES, 15, { min: 5, max: 1440 }),
  inventoryWritesEnabled: booleanSetting(process.env.INVENTORY_WRITES_ENABLED, false),
  supabase
});
