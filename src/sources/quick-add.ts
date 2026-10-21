import { randomUUID } from "node:crypto";
import { dayOf } from "@/dates";
import type { Db } from "@/db";
import { sightings } from "@/db/schema";
import { websiteDomain } from "@/radar/identity";
import { putOnRadar, type Stage } from "@/radar/radar";
import { monthlyBudget } from "@/screening/budget";
import { LANES, type Criteria, type Lane, type Usage } from "@/screening/types";

// Quick Add: the Owner shares a link or some text, for example from LinkedIn, and the radar works out
// which company it is about. The Owner confirms the draft, so nothing lands on the radar unseen, and
// what they add skips Screening's veto: they chose it.

export type QuickAddInput = { text: string; url: string };

// What the Owner confirms. `link` is what the Signal links to: never a LinkedIn profile or post,
// whose address names a person (docs/adr/0003).
export type QuickAddDraft = {
  name: string;
  website: string | null;
  country: string;
  hq: string;
  lane: Lane | null;
  secondaryLane: Lane | null;
  oneLiner: string;
  stage: Stage;
  link: string | null;
  note: string;
};

// The boundary to Claude: which company the shared text and pages are about. It never returns names of people.
export type CompanyReading =
  | {
      found: true;
      name: string;
      website: string | null;
      country: string;
      city: string;
      lane: Lane | null;
      secondaryLane: Lane | null;
      oneLiner: string;
      stage: Stage;
      pastStageRule: boolean;
      reason: string;
      usage: Usage;
    }
  | { found: false; reason: string; usage: Usage };

export type CompanyReader = {
  read(
    input: { text: string; pages: { url: string; text: string }[]; linkedinCompany: string | null },
    criteria: Criteria,
  ): Promise<CompanyReading>;
};

// The boundary to the web: a page's readable text.
export type PageFetcher = { fetchText(url: string): Promise<string> };

// A Quick Add the Owner can fix, such as a missing name. The UI shows its message as is.
export class QuickAddError extends Error {}

const PRIORITY = 100; // the Owner chose it, so it comes first in the Triage queue

export function createQuickAdd(
  db: Db,
  deps: { reader: CompanyReader; pages: PageFetcher; criteria: Criteria; monthlyCapUsd: number; now: () => Date },
) {
  const { reader, pages, criteria, now } = deps;

  return {
    async preview({ text, url }: QuickAddInput): Promise<QuickAddDraft> {
      const shared = url.trim() || firstUrlIn(text) || "";
      if (!text.trim() && !shared) throw new QuickAddError("Paste a link or some text about the company.");
      const budget = await monthlyBudget(db, deps);

      // LinkedIn is never opened (docs/adr/0002); a company page's address still tells Claude the company.
      const opened: { url: string; text: string }[] = [];
      const open = async (pageUrl: string) => {
        if (isLinkedIn(pageUrl) || opened.some((p) => p.url === pageUrl)) return;
        try {
          opened.push({ url: pageUrl, text: await pages.fetchText(pageUrl) });
        } catch {
          // An unreachable page leaves Claude with what the Owner shared.
        }
      };
      const read = async () => {
        if (!budget.allows()) throw new QuickAddError("The month's Claude budget is used up. Quick Add works again next month.");
        const reading = await reader.read({ text: text.trim(), pages: [...opened], linkedinCompany: linkedinCompanySlug(shared) }, criteria);
        await budget.record("quick-add", reading.usage);
        return reading;
      };

      if (shared) await open(shared);
      let reading = await read();
      // Once Claude names the company's own website, the radar reads it too and asks again.
      const website = reading.found && websiteDomain(reading.website) ? reading.website : null;
      if (website && !opened.some((p) => p.url === website)) {
        const before = opened.length;
        await open(website);
        if (opened.length > before) reading = await read();
      }
      if (!reading.found) {
        throw new QuickAddError(`Claude couldn't tell which company this is: ${reading.reason} Add its name or website and try again.`);
      }
      return {
        name: reading.name,
        website: websiteDomain(reading.website) ? reading.website : null,
        country: reading.country,
        hq: reading.city,
        lane: reading.lane,
        secondaryLane: reading.secondaryLane,
        oneLiner: reading.oneLiner,
        stage: reading.stage,
        link: keepableLink(shared),
        note: reading.pastStageRule ? `Probably past the Stage Rule: ${reading.reason}` : "",
      };
    },

    // Puts the confirmed draft on the radar, or adds its Signal to the startup the radar already knows.
    async add(draft: QuickAddDraft) {
      const name = draft.name.trim();
      if (!name) throw new QuickAddError("A Quick Add needs the company's name.");
      if (!draft.lane || !LANES.includes(draft.lane)) throw new QuickAddError("Choose the Lane it is closest to.");
      if (!/^[A-Z]{2}$/.test(draft.country)) throw new QuickAddError("Choose the country of its headquarters.");
      if (!draft.oneLiner.trim()) throw new QuickAddError("Add a one-line description.");

      const at = now();
      const today = dayOf(at);
      const link = keepableLink(draft.link ?? "");
      const website = websiteDomain(draft.website) ? draft.website : null;
      const company = { ...draft, name, website, link };
      return db.transaction(async (tx) => {
        const externalId = randomUUID();
        const [sighting] = await tx
          .insert(sightings)
          .values({
            source: "Quick Add",
            externalId,
            publishedOn: today,
            url: link,
            // The company's facts only; the text the Owner shared is never stored (docs/adr/0003).
            payload: { source: "Quick Add", externalId, publishedOn: today, url: link, company },
          })
          .returning({ id: sightings.id });
        return putOnRadar(tx, {
          sightingId: sighting.id,
          discovery: {
            name,
            hq: draft.hq.trim(),
            country: draft.country,
            stage: draft.stage,
            website,
            firstSeen: today,
            legalEntity: null,
            signal: { date: today, source: "Quick Add", text: `Added by the Owner: ${draft.oneLiner.trim()}`, url: link },
          },
          placement: { lane: draft.lane!, secondaryLane: draft.secondaryLane, oneLiner: draft.oneLiner.trim(), priority: PRIORITY },
          at,
          screening: { screenedAt: at, criteriaVersion: null, screeningReason: "Added by the Owner with Quick Add.", screenedBy: "owner" },
        });
      });
    },
  };
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const isLinkedIn = (url: string) => {
  const host = hostOf(url);
  return host !== null && (host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in");
};

// "volt-mover" for https://www.linkedin.com/company/volt-mover/about, else null.
function linkedinCompanySlug(url: string) {
  if (!isLinkedIn(url)) return null;
  return new URL(url).pathname.match(/^\/company\/([^/]+)/)?.[1] ?? null;
}

// A shared address the radar may keep: any web page, but of LinkedIn only a company page.
function keepableLink(url: string): string | null {
  if (!hostOf(url) || !/^https?:/i.test(url)) return null;
  if (!isLinkedIn(url)) return url;
  const slug = linkedinCompanySlug(url);
  return slug ? `https://www.linkedin.com/company/${slug}` : null;
}

const firstUrlIn = (text: string) => text.match(/https?:\/\/\S+/)?.[0];
