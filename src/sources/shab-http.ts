import type { ShabHttp } from "./shab";
import { spaced } from "./spacing";

const BASE = "https://www.shab.ch/api/v1";

// The terms set no rate limit, but a daily run has no reason to hurry (docs/adr/0002).
const MIN_INTERVAL_MS = 1000;

// The real SHAB API (https://www.amtsblattportal.ch/docs/api/). Requests go out one at a time,
// at most one per second.
export function createShabHttp(): ShabHttp {
  const nextRequest = spaced(MIN_INTERVAL_MS);

  async function get(url: string, accept: string) {
    await nextRequest();
    const response = await fetch(url, {
      headers: { accept, "user-agent": "Dealflow/0.1 (private startup radar)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`SHAB answered ${response.status} for ${url}`);
    return response.text();
  }

  return {
    fetchNewRegistrations(date, page, size) {
      const query = new URLSearchParams({
        subRubrics: "HR01",
        publicationStates: "PUBLISHED",
        "publicationDate.start": date,
        "publicationDate.end": date,
        "pageRequest.page": String(page),
        "pageRequest.size": String(size),
      });
      return get(`${BASE}/publications?${query}`, "application/json");
    },
    fetchPublicationXml(id) {
      return get(`${BASE}/publications/${encodeURIComponent(id)}/xml`, "application/xml");
    },
  };
}
