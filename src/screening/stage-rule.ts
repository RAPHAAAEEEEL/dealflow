import type { ShabSighting } from "@/sighting";

// The free part of the Stage Rule (criteria/screening-criteria.md), checked before Claude is asked.
// Returns why the Sighting is discarded, or null when Claude should judge it.
export function stageRuleRejects(sighting: ShabSighting): string | null {
  const { legalForm } = sighting.legalEntity;
  if (legalForm !== "AG" && legalForm !== "GmbH") return "Stage Rule: only an AG or a GmbH can take venture money.";
  return null;
}
