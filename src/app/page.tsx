import { createRadar } from "@/radar/radar";
import { getDb, getTriage } from "./db";
import { Nav, SourceNote } from "./nav";
import { StartupTable } from "./startup-table";

export const dynamic = "force-dynamic";

export default async function AllStartupsPage() {
  const db = await getDb();
  // The queue runs first so that overdue Candidates show as Expired.
  const waiting = (await (await getTriage()).queue()).length;
  const rows = await createRadar(db).list();

  return (
    <>
      <Nav current="startups" waiting={waiting} />
      <main className="main">
        {rows.length === 0 ? (
          <div className="empty">
            <p>No startups on the radar yet.</p>
            <p className="muted">
              Run <code>npm run job:shab</code> to screen yesterday&apos;s Swiss commercial-register entries.
            </p>
          </div>
        ) : (
          <StartupTable rows={rows} />
        )}
        <SourceNote />
      </main>
    </>
  );
}
