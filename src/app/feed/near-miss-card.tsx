"use client";

import { useActionState } from "react";
import { LANE_NAMES } from "@/screening/types";
import type { NearMiss } from "@/triage/near-misses";
import { decideNearMiss, type ActionState } from "../actions";

// A Sighting Screening discarded although it came close to a Lane. Either decision is recorded as
// evidence for Proposals to the Screening Criteria.
export function NearMissCard({ nearMiss }: { nearMiss: NearMiss }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(decideNearMiss, {});

  return (
    <form action={formAction} className="card near-miss-card">
      <input type="hidden" name="sightingId" value={nearMiss.sightingId} />
      <div className="card-kind">Near miss · closeness {nearMiss.closeness}</div>
      <div className="card-head">
        <b className="card-name">{nearMiss.name}</b>
        <span className="chip lane">near {LANE_NAMES[nearMiss.nearestLane]}</span>
      </div>
      {nearMiss.oneLiner && <p>{nearMiss.oneLiner}</p>}
      <p className="small">
        <b>Out because:</b> {nearMiss.reason}
      </p>
      <p className="small muted official">{nearMiss.registration}</p>
      <p className="small muted">Registered {nearMiss.publishedOn}</p>
      <div className="decide">
        <button type="submit" name="decision" value="Pulled In" className="btn sky" disabled={pending}>
          Pull into Triage
        </button>
        <button type="submit" name="decision" value="Rightly Out" className="btn" disabled={pending}>
          Rightly out
        </button>
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
