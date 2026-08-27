const { createClient } = require("@supabase/supabase-js");
const config = require("./appConfig");

const REQUIRED_TABLES = Object.freeze([
  "ace_system_settings",
  "profiles",
  "inventory_items",
  "inventory_movements",
  "packing_batches",
  "packing_batch_runs",
  "packing_batch_orders",
  "packing_batch_artifacts",
  "packing_activity",
  "inventory_receipts"
]);

function safeSupabaseStatus(settings = config.supabase) {
  const missing = [];
  if (!settings.url) missing.push("SUPABASE_URL");
  if (!settings.publishableKey) missing.push("SUPABASE_PUBLISHABLE_KEY");
  if (!settings.secretKey) missing.push("SUPABASE_SECRET_KEY");
  return {
    enabled: settings.enabled,
    configured: settings.configured,
    databaseMirrorEnabled: settings.databaseMirrorEnabled,
    storageMirrorEnabled: settings.storageMirrorEnabled,
    storageMirrorRequiresDatabase: Boolean(settings.storageMirrorRequiresDatabase),
    authEnabled: settings.authEnabled,
    packingBucket: settings.storageBucket,
    missingConfiguration: missing,
    secretKeyPresent: Boolean(settings.secretKey),
    publishableKeyPresent: Boolean(settings.publishableKey)
  };
}

function createSupabaseClients(settings = config.supabase) {
  if (!settings.configured) return { service: null, public: null, status: safeSupabaseStatus(settings) };
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  return {
    service: createClient(settings.url, settings.secretKey, options),
    public: createClient(settings.url, settings.publishableKey, options),
    status: safeSupabaseStatus(settings)
  };
}

function createSupabaseHealthService({ client, settings = config.supabase, requiredTables = REQUIRED_TABLES } = {}) {
  async function inspect() {
    const base = safeSupabaseStatus(settings);
    if (!base.enabled) return { ...base, connected: false, schemaReady: false, status: "DISABLED", tables: {}, storageReady: false };
    if (!base.configured || !client) return { ...base, connected: false, schemaReady: false, status: "CONFIGURATION_REQUIRED", tables: {}, storageReady: false };

    const tables = {};
    let connected = false;
    for (const table of requiredTables) {
      try {
        const { error } = await client.from(table).select("*", { head: true, count: "exact" }).limit(1);
        tables[table] = !error;
        if (!error) connected = true;
      } catch {
        tables[table] = false;
      }
    }
    let storageReady = false;
    try {
      const { data, error } = await client.storage.getBucket(settings.storageBucket);
      storageReady = !error && Boolean(data);
      if (!error) connected = true;
    } catch {
      storageReady = false;
    }
    const schemaReady = Object.values(tables).every(Boolean);
    return {
      ...base,
      connected,
      schemaReady,
      storageReady,
      tables,
      status: connected && schemaReady && storageReady ? "READY" : connected ? "SETUP_REQUIRED" : "UNAVAILABLE"
    };
  }

  return { inspect };
}

module.exports = { REQUIRED_TABLES, safeSupabaseStatus, createSupabaseClients, createSupabaseHealthService };
