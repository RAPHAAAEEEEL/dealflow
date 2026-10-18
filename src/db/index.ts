import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = Awaited<ReturnType<typeof openDb>>;

// Opens Postgres in-process: in memory when no directory is given (tests), on disk otherwise.
// No account or server is needed to develop or test.
export async function openDb(dataDir?: string) {
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

// The on-disk database shared by the job script and the dev server.
export const localDbDir = () => process.env.DEALFLOW_DB_DIR ?? ".data/pglite";
