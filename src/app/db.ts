import { connect, type Db } from "@/db";
import { createNearMisses } from "@/triage/near-misses";
import { createTriage } from "@/triage/triage";

// One database connection per server process, kept across hot reloads in development.
const global = globalThis as unknown as { dealflowDb?: Promise<Db> };

export function getDb() {
  global.dealflowDb ??= connect({ migrateHosted: false })
    .then(({ db }) => db)
    .catch((error) => {
      global.dealflowDb = undefined; // let the next request try again
      throw error;
    });
  return global.dealflowDb;
}

// Triage on the app's database, on the wall clock.
export async function getTriage() {
  return createTriage(await getDb(), { now: () => new Date() });
}

// The week's Near Misses on the app's database, on the wall clock.
export async function getNearMisses() {
  return createNearMisses(await getDb(), { now: () => new Date() });
}
