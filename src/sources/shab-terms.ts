import { addDays, dayOf } from "@/dates";

// The Owner accepts the SHAB terms in person, and again every 90 days (docs/adr/0002).
const VALID_DAYS = 90;

// A SHAB run without a valid acceptance. Its message names no company, so public logs may show it.
export class ShabTermsError extends Error {}

// The first day on which the acceptance no longer covers a run, or null when no valid date is set.
export function shabTermsRunOutOn(acceptedOn: string | undefined): string | null {
  if (!acceptedOn || !/^\d{4}-\d{2}-\d{2}$/.test(acceptedOn) || Number.isNaN(Date.parse(acceptedOn))) return null;
  return addDays(acceptedOn, VALID_DAYS);
}

export function assertShabTermsAccepted(acceptedOn: string | undefined, at: Date) {
  const runOutOn = shabTermsRunOutOn(acceptedOn);
  if (!runOutOn) throw new ShabTermsError("The SHAB terms have not been accepted yet.");
  if (dayOf(at) >= runOutOn) throw new ShabTermsError(`The SHAB terms, accepted on ${acceptedOn}, ran out on ${runOutOn}.`);
}
