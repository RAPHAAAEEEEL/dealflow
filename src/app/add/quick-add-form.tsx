"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { STAGES, type Stage } from "@/radar/radar";
import { LANE_NAMES, LANES, type Lane } from "@/screening/types";
import type { QuickAddDraft } from "@/sources/quick-add";
import { addQuickAdd, previewQuickAdd } from "../actions";

const COUNTRIES = ["DE", "AT", "CH", "LI", "NL", "FR", "IT", "GB", "US"];


// Two steps: what the Owner shared, then Claude's draft, which the Owner corrects and confirms.
// A share from the iPhone arrives in the address's #fragment, which never reaches the server or its logs.
export function QuickAddForm() {
  const [shared, setShared] = useState({ text: "", url: "" });
  const [draft, setDraft] = useState<QuickAddDraft | null>(null);
  const [known, setKnown] = useState<{ name: string; status: string } | null>(null);
  const [added, setAdded] = useState<{ name: string; known: boolean } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const read = (input = shared) =>
    startTransition(async () => {
      setError("");
      const result = await previewQuickAdd(input);
      if (result.error) return setError(result.error);
      setDraft(result.draft!);
      setKnown(result.known ?? null);
    });

  // The iPhone shortcut sends what was shared as `share` (a link or text) and the clipboard as `text`.
  // Arriving with something shared, the page asks Claude right away, so the Owner only checks and adds.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (!params.has("share") && !params.has("url") && !params.has("text")) return;
    const share = (params.get("share") ?? "").trim();
    const isLink = /^https?:\/\/\S+$/.test(share);
    const input = {
      url: params.get("url") ?? (isLink ? share : ""),
      text: [isLink ? "" : share, params.get("text") ?? ""].filter((t) => t.trim()).join("\n"),
    };
    setShared(input);
    // Through the router, so a later refresh doesn't bring the share back.
    router.replace(window.location.pathname, { scroll: false });
    if (input.url || input.text) read(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, for the share the page opened with
  }, []);

  const add = () =>
    startTransition(async () => {
      if (!draft) return;
      setError("");
      const result = await addQuickAdd(draft);
      if (result.error) return setError(result.error);
      setAdded({ name: draft.name, known: Boolean(result.known) });
      setDraft(null);
      setKnown(null);
      setShared({ text: "", url: "" });
    });

  const pasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setShared((s) => ({ ...s, text: s.text ? `${s.text}\n${text}` : text }));
    } catch {
      setError("Safari didn't allow reading the clipboard. Paste into the text field instead.");
    }
  };

  const set = <K extends keyof QuickAddDraft>(key: K, value: QuickAddDraft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  if (added) {
    return (
      <div className="card">
        <p>
          <b>{added.name}</b>{" "}
          {added.known ? "was already on the radar; it got a new Signal." : "is on the radar, first in your Triage queue."}
        </p>
        <div className="decide">
          <Link href="/feed" className="btn sky">
            To the Feed
          </Link>
          <button type="button" className="btn" onClick={() => setAdded(null)}>
            Add another
          </button>
        </div>
      </div>
    );
  }

  if (draft) {
    return (
      <div className="card candidate-card">
        <div className="card-kind">Claude&apos;s draft · check it, then add</div>
        {known && (
          <p className="note">
            Already on the radar as <b>{known.name}</b> ({known.status}). Adding gives it a new Signal
            {known.status === "Candidate" || known.status === "Expired" ? " and puts it first in Triage." : "; its Triage decision stays."}
          </p>
        )}
        {draft.note && <p className="note">{draft.note}</p>}
        <label className="field">
          Name
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="field">
          Website
          <input value={draft.website ?? ""} placeholder="https://…" onChange={(e) => set("website", e.target.value || null)} />
        </label>
        <label className="field">
          Lane
          <select value={draft.lane ?? ""} onChange={(e) => set("lane", (e.target.value || null) as Lane | null)}>
            <option value="">Choose…</option>
            {LANES.map((l) => (
              <option key={l} value={l}>
                {LANE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          One-liner
          <input value={draft.oneLiner} onChange={(e) => set("oneLiner", e.target.value)} />
        </label>
        <label className="field">
          Country
          <select value={draft.country} onChange={(e) => set("country", e.target.value)}>
            <option value="">Choose…</option>
            {[...new Set([...COUNTRIES, ...(draft.country ? [draft.country] : [])])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          City
          <input value={draft.hq} onChange={(e) => set("hq", e.target.value)} />
        </label>
        <label className="field">
          Stage
          <select value={draft.stage} onChange={(e) => set("stage", e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {draft.link && <p className="small muted">Linked to {draft.link}</p>}
        <div className="decide">
          <button type="button" className="btn sky" disabled={pending} onClick={add}>
            {pending ? "Adding…" : "Add to radar"}
          </button>
          <button type="button" className="btn" disabled={pending} onClick={() => (setDraft(null), setKnown(null))}>
            Back
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <label className="field">
        Link
        <input
          value={shared.url}
          inputMode="url"
          placeholder="https://…"
          onChange={(e) => setShared((s) => ({ ...s, url: e.target.value }))}
        />
      </label>
      <label className="field">
        Text
        <textarea
          value={shared.text}
          placeholder="Paste a post, a description or just the startup's name"
          onChange={(e) => setShared((s) => ({ ...s, text: e.target.value }))}
        />
      </label>
      <div className="decide">
        <button type="button" className="btn sky" disabled={pending || (!shared.text.trim() && !shared.url.trim())} onClick={() => read()}>
          {pending ? "Reading…" : "Read it"}
        </button>
        <button type="button" className="btn" disabled={pending} onClick={pasteClipboard}>
          Paste copied text
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
