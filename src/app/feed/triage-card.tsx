"use client";

import { useActionState, useState } from "react";
import type { RadarRow } from "@/radar/radar";
import { LANE_NAMES } from "@/screening/types";
import { CLAIMS, OWNER_FACTORS, type Claim, type OwnerFactor } from "@/triage/types";
import { decide, type ActionState } from "../actions";

const factorKeys = Object.keys(OWNER_FACTORS) as OwnerFactor[];
const claimKeys = Object.keys(CLAIMS) as Claim[];

// One Candidate with its Triage form. Every Factor and both Calls start empty on purpose
// (docs/adr/0004): the numbers in the Track Record must be the Owner's own.
export function TriageCard({ candidate }: { candidate: RadarRow }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(decide, {});
  const [factors, setFactors] = useState<Partial<Record<OwnerFactor, number>>>({});
  const [calls, setCalls] = useState<Partial<Record<Claim, number>>>({});
  const [rationale, setRationale] = useState("");

  const complete =
    factorKeys.every((f) => factors[f] !== undefined) && claimKeys.every((c) => calls[c] !== undefined) && rationale.trim() !== "";

  return (
    <form action={formAction} className="card candidate-card">
      <input type="hidden" name="startupId" value={candidate.id} />
      {factorKeys.map((f) => factors[f] !== undefined && <input key={f} type="hidden" name={f} value={factors[f]} />)}
      {claimKeys.map((c) => calls[c] !== undefined && <input key={c} type="hidden" name={c} value={calls[c]} />)}

      <div className="card-kind">
        New Candidate · {candidate.latestSignal?.source ?? "radar"} · Priority {candidate.priority}
      </div>
      <div className="card-head">
        <b className="card-name">{candidate.name}</b>
        <span className="chip lane">{LANE_NAMES[candidate.lane]}</span>
      </div>
      <p>{candidate.oneLiner}</p>
      {candidate.latestSignal && (
        // Only register text is a quote (SHAB terms); other Signals are the radar's or the Owner's own words.
        <p className={`small muted ${candidate.latestSignal.source === "SHAB" ? "official" : ""}`}>
          {candidate.latestSignal.text}
          {candidate.latestSignal.url && (
            <>
              {" "}
              <a href={candidate.latestSignal.url} target="_blank" rel="noreferrer">
                Source
              </a>
            </>
          )}
        </p>
      )}
      <p className="small muted">
        {candidate.hq}, {candidate.country} · first seen {candidate.firstSeen}
      </p>

      <h3>Scorecard</h3>
      {factorKeys.map((f) => (
        <div key={f} className="factor">
          <span>{OWNER_FACTORS[f]}</span>
          <span className="segments" role="radiogroup" aria-label={OWNER_FACTORS[f]}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={factors[f] === v}
                className={factors[f] === v ? "on" : ""}
                onClick={() => setFactors((current) => ({ ...current, [f]: v }))}
              >
                {v}
              </button>
            ))}
          </span>
        </div>
      ))}
      <p className="small muted">Momentum is set by the radar from recent Signals.</p>

      <h3>Calls</h3>
      {claimKeys.map((c) => (
        <label key={c} className="call">
          <span>{CLAIMS[c]}</span>
          {/* Unset, the slider starts one step below 0 with its handle hidden, so there is no number to anchor
              on and the first tap anywhere, 50% included, sets a value. */}
          <input
            type="range"
            min={calls[c] === undefined ? -5 : 0}
            max={100}
            step={5}
            value={calls[c] ?? -5}
            data-unset={calls[c] === undefined}
            aria-label={CLAIMS[c]}
            onChange={(e) => setCalls((current) => ({ ...current, [c]: Math.max(0, Number(e.target.value)) }))}
          />
          <b>{calls[c] === undefined ? "–" : `${calls[c]}%`}</b>
        </label>
      ))}

      <input
        className="rationale"
        name="rationale"
        placeholder="One-line rationale"
        autoComplete="off"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
      <div className="decide">
        <button type="submit" name="decision" value="Track" className="btn sky" disabled={!complete || pending}>
          Track
        </button>
        <button type="submit" name="decision" value="Pass" className="btn" disabled={!complete || pending}>
          Pass
        </button>
        <button type="submit" name="decision" value="Out of Scope" className="btn" disabled={pending} title="Screening was wrong. No Call.">
          Out of Scope
        </button>
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
