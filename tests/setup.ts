import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/db/schema/index.js";
import { beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);
export const testDb = drizzle(client, { schema });

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // Truncate all tables between tests
  const tables = await testDb.execute(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  for (const { tablename } of tables) {
    if (tablename !== "__drizzle_migrations") {
      await testDb.execute(sql.raw(`TRUNCATE TABLE "${tablename}" CASCADE`));
    }
  }
});

afterAll(async () => {
  await client.end();
});
