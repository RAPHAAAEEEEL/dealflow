// Brings the database schema up to date: the hosted Postgres when DATABASE_URL is set, else the local one.
// Runs in every Vercel build (npm run vercel-build). Only a production build touches the hosted
// database, and a production build without one fails instead of deploying a radar with no data
// (docs/adr/0007). Preview builds skip migrations, so a branch can't change production's schema.
import { connect } from "@/db";

if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
  console.log(`Skipping migrations in a ${process.env.VERCEL_ENV ?? "non-production"} build.`);
  process.exit(0);
}
if (process.env.VERCEL && !process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set for this production build. Set it in Vercel, then redeploy.");
  process.exit(1);
}

const { close } = await connect({ migrateHosted: true });
await close();
console.log(`Database schema is up to date (${process.env.DATABASE_URL ? "hosted" : "local"}).`);
