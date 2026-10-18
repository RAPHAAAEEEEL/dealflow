import { localDbDir, openDb, type Db } from "@/db";
import { createTriage } from "@/triage/triage";

// One local database per server process, kept across hot reloads in development.
const global = globalThis as unknown as { dealflowDb?: Promise<Db> };

export function getDb() {
  global.dealflowDb ??= openDb(localDbDir()).catch((error) => {
    global.dealflowDb = undefined; // let the next request try again
    throw error;
  });
  return global.dealflowDb;
}

// Triage on the local database, on the wall clock.
export async function getTriage() {
  return createTriage(await getDb(), { now: () => new Date() });
}
