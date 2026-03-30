import { db } from "../db/index.js";
import { runSync } from "../services/sync-runner.js";
import type { ServiceName } from "../services/oauth-providers.js";

const services = process.argv.slice(2) as ServiceName[];
const toSync = services.length > 0 ? services : undefined;

console.log(`Syncing ${toSync ? toSync.join(", ") : "all services"}...`);

const results = await runSync(db, toSync);

for (const r of results) {
  if (r.success) {
    console.log(`✓ ${r.service}: ${JSON.stringify(r.detail)}`);
  } else {
    console.error(`✗ ${r.service}: ${r.error}`);
  }
}

process.exit(results.every((r) => r.success) ? 0 : 1);
