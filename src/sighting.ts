// A Sighting is one raw publication from a Source, before Screening has judged it (CONTEXT.md).

export type LegalForm = "AG" | "GmbH" | "Other";

export type Sighting = {
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
