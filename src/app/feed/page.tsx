import { requireOwner } from "../owner";
import { runWarnings } from "@/digest/digest";
import { getDb, getNearMisses, getTriage } from "../db";
import { Nav, SourceNote } from "../nav";
import { NearMissCard } from "./near-miss-card";
import { TriageCard } from "./triage-card";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  await requireOwner();
  const queue = await (await getTriage()).queue();
  const nearMisses = await (await getNearMisses()).list();
  const warnings = await runWarnings(await getDb(), () => new Date());

  return (
    <>
      <Nav current="feed" waiting={queue.length} />
      <main className="main feed">
        {warnings.length > 0 && (
          // The Sunday Digest can be switched off together with the SHAB schedule, so the Feed warns too.
          <div className="card run-warnings" role="status">
            {warnings.map((w) => (
              <p key={w} className="small">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
        <h2 className="feed-title">
          {queue.length === 0 ? "Nothing to triage" : `${queue.length} Candidate${queue.length === 1 ? "" : "s"} waiting`}
        </h2>
        {queue.length === 0 ? (
          <p className="muted">New Candidates appear here after the next SHAB run. Highest Priority first, at most 15.</p>
        ) : (
          <p className="muted small">
            Highest Priority first. Track and Pass need every Factor, both Calls and a one-line rationale. Nothing is
            filled in for you.
          </p>
        )}
        {queue.map((candidate) => (
          <TriageCard key={candidate.id} candidate={candidate} />
        ))}

        <h2 className="feed-section">Near misses</h2>
        {nearMisses.length === 0 ? (
          <p className="muted">No close discards this week.</p>
        ) : (
          <p className="muted small">
            Screening discarded these, but they came close to a Lane. Pull one into Triage if Screening was wrong, or
            confirm it was rightly out. Both decisions feed Proposals to the Screening Criteria.
          </p>
        )}
        {nearMisses.map((nearMiss) => (
          <NearMissCard key={nearMiss.sightingId} nearMiss={nearMiss} />
        ))}
        <SourceNote />
      </main>
    </>
  );
}
