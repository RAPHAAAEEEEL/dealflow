import { readFile } from "node:fs/promises";
import type { Criteria } from "./types";

const CRITERIA_FILE = "criteria/screening-criteria.md";

// Reads the versioned Screening Criteria. They take effect only once the Owner has accepted them,
// so a file whose front matter doesn't say "status: accepted ..." is refused.
export async function loadCriteria(): Promise<Criteria> {
  const file = await readFile(CRITERIA_FILE, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(file);
  const version = match && /^version:\s*(\d+)\s*$/m.exec(match[1]);
  if (!match || !version) throw new Error(`${CRITERIA_FILE} needs front matter with a numeric version`);
  const status = /^status:\s*(.*)$/m.exec(match[1])?.[1] ?? "missing";
  if (!status.startsWith("accepted")) {
    throw new Error(`${CRITERIA_FILE} version ${version[1]} is not accepted by the Owner yet (status: ${status})`);
  }
  return { version: Number(version[1]), text: match[2].trim() };
}
