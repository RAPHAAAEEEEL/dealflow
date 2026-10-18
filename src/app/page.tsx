import { createRadar } from "@/radar/radar";
import { LANE_NAMES } from "@/screening/types";
import { getDb } from "./db";

export const dynamic = "force-dynamic";

const formatDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function RadarPage() {
  const rows = await createRadar(await getDb()).list();

  return (
    <>
      <header className="top">
        <h1>Dealflow</h1>
        <nav>
          <span className="tab on">All startups</span>
        </nav>
      </header>
      <main className="main">
        {rows.length === 0 ? (
          <div className="empty">
            <p>No startups on the radar yet.</p>
            <p className="muted">
              Run <code>npm run job:shab</code> to screen yesterday&apos;s Swiss commercial-register entries.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Startup</th>
                  <th>Lane</th>
                  <th className="hide-s">Stage</th>
                  <th>Status</th>
                  <th className="hide-s">Latest Signal</th>
                  <th className="hide-s">Priority</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.name}</b>
                      <div className="small muted">{r.oneLiner}</div>
                      <div className="small muted">
                        {r.hq}, {r.country}
                      </div>
                    </td>
                    <td>
                      <span className="chip lane">{LANE_NAMES[r.lane]}</span>
                      {r.secondaryLane && (
                        <div className="small muted">+ {LANE_NAMES[r.secondaryLane]}</div>
                      )}
                    </td>
                    <td className="hide-s" style={{ whiteSpace: "nowrap" }}>
                      {r.stage}
                    </td>
                    <td>
                      <span className="chip candidate">{r.status}</span>
                    </td>
                    <td className="hide-s small">
                      {r.latestSignal && (
                        <>
                          {formatDate(r.latestSignal.date)} · <b>{r.latestSignal.source}</b>
                          <div className="muted official">{r.latestSignal.text}</div>
                        </>
                      )}
                    </td>
                    <td className="hide-s">{r.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer>
          Registration data comes from the Swiss Official Gazette of Commerce (
          <a href="https://www.shab.ch" target="_blank" rel="noreferrer">
            SHAB, Amtsblattportal
          </a>
          ). This is not an official publication. Text quoted from SHAB is shown with a grey bar; lanes, one-liners
          and priorities are Dealflow&apos;s own assessment.
        </footer>
      </main>
    </>
  );
}
