import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = { migrationsFolder: "drizzle" };

// Postgres in-process: in memory when no directory is given (tests), on disk otherwise.
// No account or server is needed to develop or test.
export async function openDb(dataDir?: string): Promise<Db> {
  return (await openPglite(dataDir)).db;
}

async function openPglite(dataDir?: string) {
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, MIGRATIONS);
  return { db, close: () => client.close() };
}

// The on-disk database shared by the job script and the dev server.
const localDbDir = () => process.env.DEALFLOW_DB_DIR ?? ".data/pglite";

// The database the app and scripts use: the hosted Postgres when DATABASE_URL is set (Neon in
// production), the local one otherwise. The local one is always brought up to date; the hosted one
// only when asked, which happens at deploy (docs/adr/0007), never on a page request or a job run.
export async function connect({ migrateHosted }: { migrateHosted: boolean }): Promise<{ db: Db; close(): Promise<void> }> {
  const url = process.env.DATABASE_URL;
  // Closing the local database lets a script's process end.
  if (!url) return openPglite(localDbDir());
  const pool = new Pool({ connectionString: url, max: 3 });
  // Neon closes idle connections. The pool drops the broken client; without a handler the error
  // would crash the process.
  pool.on("error", (error) => console.error(`Database connection dropped: ${error.message}`));
  const db = drizzlePg(pool, { schema });
  if (migrateHosted) await migratePg(db, MIGRATIONS);
  return { db, close: () => pool.end() };
}
