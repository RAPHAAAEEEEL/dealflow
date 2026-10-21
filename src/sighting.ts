import type { QuickAddDraft } from "@/sources/quick-add";

// A Sighting is one raw publication from a Source, before Screening has judged it (CONTEXT.md).

export type LegalForm = "AG" | "GmbH" | "Other";

// A new entry in the Swiss commercial register, from the SHAB.
export type ShabSighting = {
  source: "SHAB";
  externalId: string;
  publishedOn: string; // YYYY-MM-DD
  url: string;
  legalEntity: {
    name: string;
    uid: string | null;
    seat: string;
    legalForm: LegalForm;
    purpose: string;
    capitalChf: number | null;
  };
};

// What Quick Add keeps of what the Owner shared: the company's facts as the Owner confirmed them,
// never the shared text, which may name people (docs/adr/0003).
export type QuickAddSighting = {
  source: "Quick Add";
  externalId: string;
  publishedOn: string;
  url: string | null;
  company: QuickAddDraft;
};

export type Sighting = ShabSighting | QuickAddSighting;

// A stored payload that SHAB-only code reads, such as Screening and Near Misses.
export function shabPayload(payload: Sighting | null): ShabSighting {
  if (payload?.source !== "SHAB") throw new Error(`Expected a SHAB Sighting, got ${payload?.source ?? "none"}`);
  return payload;
}
