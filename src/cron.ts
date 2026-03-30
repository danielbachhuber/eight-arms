import cron from "node-cron";
import { db } from "./db/index.js";
import { runSync } from "./services/sync-runner.js";

let task: cron.ScheduledTask | null = null;

export function startCron(intervalMinutes: number = 5): void {
  if (task) {
    task.stop();
  }

  const cronExpr = `*/${intervalMinutes} * * * *`;
  console.log(`Starting sync cron: every ${intervalMinutes} minutes (${cronExpr})`);

  task = cron.schedule(cronExpr, async () => {
    console.log(`[cron] Running sync at ${new Date().toISOString()}`);
    try {
      const results = await runSync(db);
      for (const r of results) {
        if (r.success) {
          console.log(`[cron] ${r.service}: synced (${JSON.stringify(r.detail)})`);
        } else {
          console.error(`[cron] ${r.service}: failed - ${r.error}`);
        }
      }
    } catch (err) {
      console.error("[cron] Sync failed:", err);
    }
  });
}

export function stopCron(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
