"use server";

import { revalidatePath } from "next/cache";
import { NEAR_MISS_DECISIONS, NearMissError } from "@/triage/near-misses";
import { TriageError } from "@/triage/triage";
import { CLAIMS, OWNER_FACTORS, type Claim, type OwnerFactor, type TriageInput } from "@/triage/types";
import { getNearMisses, getTriage } from "./db";
import { isOwner } from "./owner";

// What a form action reports back to its card: nothing when it worked, else a message to show.
export type ActionState = { error?: string };

// Turns the Triage card's form into a decision. Validation lives in the Triage module; its
// TriageError messages go back to the card unchanged.
export async function decide(_: ActionState, form: FormData): Promise<ActionState> {
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

// The Owner's decision on a Near Miss: pull it into Triage, or confirm Screening was right to discard it.
export async function decideNearMiss(_: ActionState, form: FormData): Promise<ActionState> {
  if (!(await isOwner())) return { error: "Only the Owner can decide on Near Misses. Sign in again." };
  const sightingId = String(form.get("sightingId"));
  const decision = NEAR_MISS_DECISIONS.find((d) => d === form.get("decision"));
  if (!decision) return { error: `Unknown decision "${form.get("decision")}".` };
  try {
    await (await getNearMisses()).decide(sightingId, decision);
  } catch (error) {
    if (error instanceof NearMissError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return {};
}
