import { requireOwner } from "../owner";
import { getTriage } from "../db";
import { Nav, SourceNote } from "../nav";
import { TriageCard } from "./triage-card";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  await requireOwner();
  const queue = await (await getTriage()).queue();

  return (
    <>
      <Nav current="feed" waiting={queue.length} />
      <main className="main feed">
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
        <SourceNote />
      </main>
    </>
  );
}
