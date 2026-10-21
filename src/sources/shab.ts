import { XMLParser } from "fast-xml-parser";
import type { Discovery } from "@/radar/radar";
import type { LegalForm, ShabSighting } from "@/sighting";

// The two calls Dealflow makes to the SHAB API, returning the raw response bodies.
export type ShabHttp = {
  fetchNewRegistrations(date: string, page: number, size: number): Promise<string>;
  fetchPublicationXml(id: string): Promise<string>;
};

const PAGE_SIZE = 500;

// Swiss legal-form codes (eCH-0097). Only these two can take venture money in the Stage Rule's sense.
const LEGAL_FORMS: Record<string, LegalForm> = { "0106": "AG", "0107": "GmbH" };

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

export function createShabSource(http: ShabHttp, { pageSize = PAGE_SIZE } = {}) {
  return {
    async fetchSightings(date: string): Promise<ShabSighting[]> {
      const ids: string[] = [];
      for (let page = 0, total = Infinity; page * pageSize < total; page++) {
        const list = JSON.parse(await http.fetchNewRegistrations(date, page, pageSize));
        total = list.total;
        ids.push(...list.content.map((item: { meta: { id: string } }) => item.meta.id));
      }
      const sightings: ShabSighting[] = [];
      for (const id of ids) sightings.push(toSighting(id, await http.fetchPublicationXml(id)));
      return sightings;
    },
  };
}

// Reads only the structured company fields. The free publication text is never read,
// because it lists the founders by name (docs/adr/0003).
function toSighting(id: string, body: string): ShabSighting {
  const { meta, content } = parser.parse(body).publication;
  // SHAB calls the registered entity "company"; Dealflow calls it a Legal Entity (CONTEXT.md).
  const { company, purpose, capital } = content.commonsNew;
  const nominal = [capital].flat()[0]?.nominal;
  return {
    source: "SHAB",
    externalId: id,
    publishedOn: meta.publicationDate,
    url: `https://www.shab.ch/#!/search/publications/detail/${id}`,
    legalEntity: {
      name: company.name,
      uid: company.uid ?? null,
      seat: company.seat,
      legalForm: LEGAL_FORMS[company.legalForm] ?? "Other",
      purpose: purpose ?? "",
      capitalChf: nominal ? Number(nominal) : null,
    },
  };
}

// What a register entry tells the radar: a Swiss startup with its first Legal Entity, before any round.
export function shabDiscovery(sighting: ShabSighting): Discovery {
  const e = sighting.legalEntity;
  return {
    name: e.name,
    hq: e.seat.replace(/\s*\([A-Z]{2}\)$/, ""),
    country: "CH",
    stage: "Pre-round",
    website: null,
    firstSeen: sighting.publishedOn,
    legalEntity: { name: e.name, uid: e.uid, legalForm: e.legalForm, seat: e.seat, registeredOn: sighting.publishedOn },
    signal: { date: sighting.publishedOn, source: "SHAB", text: registrationText(sighting), url: sighting.url },
  };
}

// The Signal text for a new registration. It quotes the register, so it is shown apart from the radar's own words (SHAB terms).
export function registrationText({ legalEntity: e }: ShabSighting) {
  const capital = e.capitalChf === null ? "" : ` Share capital CHF ${e.capitalChf.toLocaleString("en-US")}.`;
  return `New registration: ${e.name}, ${e.seat}. Purpose: ${e.purpose || "none given."}${capital}`;
}
