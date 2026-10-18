import { localDbDir, openDb, type Db } from "@/db";

// One local database per server process, kept across hot reloads in development.
const global = globalThis as unknown as { dealflowDb?: Promise<Db> };

export function getDb() {
  global.dealflowDb ??= openDb(localDbDir()).catch((error) => {
    global.dealflowDb = undefined; // let the next request try again
    throw error;
  });
  return global.dealflowDb;
}
