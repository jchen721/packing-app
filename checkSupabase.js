const config = require("./appConfig");
const { createSupabaseClients, createSupabaseHealthService } = require("./supabaseClient");

async function main() {
  const clients = createSupabaseClients();
  const health = await createSupabaseHealthService({ client: clients.service }).inspect();
  console.log(JSON.stringify(health, null, 2));
  if (health.enabled && health.status !== "READY") process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  console.error(`Supabase check failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { main };
