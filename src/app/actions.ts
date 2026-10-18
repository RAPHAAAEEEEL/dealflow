"use server";

import { revalidatePath } from "next/cache";
import { TriageError } from "@/triage/triage";
import { CLAIMS, OWNER_FACTORS, type Claim, type OwnerFactor, type TriageInput } from "@/triage/types";
import { getTriage } from "./db";
import { isOwner } from "./owner";

export type DecideState = { error?: string };

// Turns the Triage card's form into a decision. Validation lives in the Triage module; its
// TriageError messages go back to the card unchanged.
export async function decide(_: DecideState, form: FormData): Promise<DecideState> {
  if (!(await isOwner())) return { error: "Only the Owner can do Triage. Sign in again." };
  const startupId = String(form.get("startupId"));
  const decision = String(form.get("decision"));
  const rationale = String(form.get("rationale") ?? "");
  // A field the card didn't send stays missing, so the Triage module refuses it instead of reading 0.
  const numberField = (key: string) => {
    const value = form.get(key);
    return value === null || value === "" ? undefined : Number(value);
  };

  let input: TriageInput;
  if (decision === "Out of Scope") {
    input = { decision, rationale };
  } else if (decision === "Track" || decision === "Pass") {
    input = {
      decision,
      rationale,
      scorecard: Object.fromEntries(Object.keys(OWNER_FACTORS).map((f) => [f, numberField(f)])) as Record<OwnerFactor, number>,
      calls: Object.fromEntries(Object.keys(CLAIMS).map((c) => [c, numberField(c)])) as Record<Claim, number>,
    };
  } else {
    return { error: `Unknown decision "${decision}".` };
  }

  try {
    await (await getTriage()).decide(startupId, input);
  } catch (error) {
    if (error instanceof TriageError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return {};
}
