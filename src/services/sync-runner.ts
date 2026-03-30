import type { Database } from "../db/index.js";
import { syncConfig } from "../db/schema/settings.js";
import { syncGmail } from "./sync-gmail.js";
import { syncGithub } from "./sync-github.js";
import { syncTodoist } from "./sync-todoist.js";
import type { ServiceName } from "./oauth-providers.js";

export interface SyncResult {
  service: ServiceName;
  success: boolean;
  detail: Record<string, number> | null;
  error: string | null;
}

export async function runSync(
  db: Database,
  services?: ServiceName[]
): Promise<SyncResult[]> {
  const toSync = services || (["gmail", "github", "todoist"] as ServiceName[]);
  const results: SyncResult[] = [];

  for (const service of toSync) {
    try {
      let detail: Record<string, number>;

      switch (service) {
        case "gmail":
          detail = await syncGmail(db);
          break;
        case "github":
          detail = await syncGithub(db);
          break;
        case "todoist":
          detail = await syncTodoist(db);
          break;
      }

      // Update last sync time
      await db
        .insert(syncConfig)
        .values({ service, lastSyncAt: new Date() })
        .onConflictDoUpdate({
          target: syncConfig.service,
          set: { lastSyncAt: new Date() },
        });

      results.push({ service, success: true, detail, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ service, success: false, detail: null, error: message });
    }
  }

  return results;
}
