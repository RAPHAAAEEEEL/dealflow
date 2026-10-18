"use client";

import { useState } from "react";
import { STARTUP_STATUSES, type RadarRow, type StartupStatus } from "@/radar/radar";
import { LANE_NAMES, LANES, type Lane } from "@/screening/types";

type SortKey = "name" | "lane" | "status" | "signal" | "roundCall" | "priority";

const STATUS_CLASS: Record<StartupStatus, string> = {
  Candidate: "status-candidate",
  Track: "status-track",
  Pass: "status-pass",
  "Out of Scope": "status-out-of-scope",
  Expired: "status-expired",
};

const sortValue: Record<SortKey, (r: RadarRow) => string | number> = {
  name: (r) => r.name.toLowerCase(),
  lane: (r) => r.lane,
  status: (r) => STARTUP_STATUSES.indexOf(r.status),
  signal: (r) => r.latestSignal?.date ?? "",
  roundCall: (r) => r.roundCall ?? -1,
  priority: (r) => r.priority,
};

const formatDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// The "all startups" table from docs/ui.md: sortable and filterable on desktop, a searchable list on a phone.
export function StartupTable({ rows }: { rows: RadarRow[] }) {
  const [lane, setLane] = useState<Lane | "all">("all");
  const [status, setStatus] = useState<StartupStatus | "active">("active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "priority", direction: -1 });

  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => lane === "all" || r.lane === lane)
    .filter((r) => (status === "active" ? r.status !== "Expired" && r.status !== "Out of Scope" : r.status === status))
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.oneLiner.toLowerCase().includes(q))
    .sort((a, b) => {
      const x = sortValue[sort.key](a);
      const y = sortValue[sort.key](b);
      return (x > y ? 1 : x < y ? -1 : 0) * sort.direction;
    });

  const header = (key: SortKey, label: string, className = "") => (
    <th className={className}>
      <button
        type="button"
        className="sort"
        onClick={() => setSort({ key, direction: sort.key === key ? (-sort.direction as 1 | -1) : key === "name" || key === "lane" ? 1 : -1 })}
      >
        {label}
        {sort.key === key ? (sort.direction === -1 ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
  const chip = <T extends string>(current: T, value: T, label: string, set: (v: T) => void) => (
    <button key={value} type="button" className={`fchip ${current === value ? "on" : ""}`} onClick={() => set(value)}>
      {label}
    </button>
  );

  return (
    <>
      <div className="filters">
        <input className="search" placeholder="Search startups" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div>
          {chip(lane, "all", "All Lanes", setLane)}
          {LANES.map((l) => chip(lane, l, LANE_NAMES[l], setLane))}
        </div>
        <div>
          {chip(status, "active", "Active", setStatus)}
          {STARTUP_STATUSES.map((s) => chip(status, s, s, setStatus))}
        </div>
      </div>
      <ul className="startup-list mobile-only">
        {shown.map((r) => (
          <li key={r.id} className="card">
            <div className="card-head">
              <b>{r.name}</b>
              <span className={`chip ${STATUS_CLASS[r.status]}`}>{r.status}</span>
            </div>
            <div className="small muted">{r.oneLiner}</div>
            <div className="small">
              <span className="chip lane">{LANE_NAMES[r.lane]}</span> Round Call {r.roundCall === null ? "–" : `${r.roundCall}%`}
            </div>
          </li>
        ))}
      </ul>
      <div className="table-wrap desktop-only">
        <table>
          <thead>
            <tr>
              {header("name", "Startup")}
              {header("lane", "Lane")}
              {header("status", "Status")}
              {header("signal", "Latest Signal", "hide-s")}
              {header("roundCall", "Round Call")}
              {header("priority", "Priority", "hide-s")}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                  <div className="small muted">{r.oneLiner}</div>
                  <div className="small muted">
                    {r.hq}, {r.country} · {r.stage}
                  </div>
                </td>
                <td>
                  <span className="chip lane">{LANE_NAMES[r.lane]}</span>
                  {r.secondaryLane && <div className="small muted">+ {LANE_NAMES[r.secondaryLane]}</div>}
                </td>
                <td>
                  <span className={`chip ${STATUS_CLASS[r.status]}`}>{r.status}</span>
                </td>
                <td className="hide-s small">
                  {r.latestSignal && (
                    <>
                      {formatDate(r.latestSignal.date)} · <b>{r.latestSignal.source}</b>
                      <div className="muted official">{r.latestSignal.text}</div>
                    </>
                  )}
                </td>
                <td>{r.roundCall === null ? <span className="muted">–</span> : `${r.roundCall}%`}</td>
                <td className="hide-s">{r.status === "Candidate" ? r.priority : <span className="muted">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        {shown.length} of {rows.length} startups
      </p>
    </>
  );
}
