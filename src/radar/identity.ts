// When two records are the same Startup (CONTEXT.md): the same Legal Entity, the same website, or the
// same name once the legal form is dropped, unless their Legal Entities differ. Anything less certain
// stays separate until a Proposal merges it, because a duplicate does less harm than two startups
// wrongly merged (docs/adr/0009).

// Legal-form words that end a company name in DACH registers and elsewhere.
const LEGAL_FORM_WORDS = new Set(["gmbh", "ag", "ug", "se", "kg", "og", "ohg", "kgaa", "sa", "sarl", "ltd", "inc", "llc", "bv", "co", "eu"]);

// "Volt Mover GmbH", "VOLT MOVER" and "Volt-Mover UG (haftungsbeschränkt)" all give "volt mover".
// A name of punctuation only gives "", which matches nothing.
export function nameKey(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // ü → u
    .toLowerCase()
    .replace(/\(haftungsbeschrankt\)/g, " ")
    .replace(/\be\.\s?u\.?$/g, " eu")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ");
  while (words.length > 1 && LEGAL_FORM_WORDS.has(words.at(-1)!)) words.pop();
  return words.join(" ");
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// LinkedIn in all its forms. It is never opened, and never a startup's own website (docs/adr/0002).
export function isLinkedIn(url: string | null | undefined): boolean {
  const host = hostOf(url);
  return host !== null && (host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in");
}

// Hosts that many companies share by path, and the news sites themselves: their domain doesn't say
// which startup a page belongs to.
const SHARED_HOSTS = new Set([
  "xing.com",
  "github.com",
  "gitlab.com",
  "sites.google.com",
  "linktr.ee",
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "medium.com",
  "notion.so",
  "crunchbase.com",
  "deutsche-startups.de",
  "startupticker.ch",
  "eu-startups.com",
  "brutkasten.com",
]);

// "https://www.volt-mover.de/about" gives "volt-mover.de"; a LinkedIn or shared host gives null.
export function websiteDomain(website: string | null | undefined): string | null {
  const host = hostOf(website);
  if (!host || !host.includes(".") || isLinkedIn(website) || SHARED_HOSTS.has(host)) return null;
  return host;
}

// A startup's own website with its scheme, or null when the address is none.
export function ownWebsite(website: string | null | undefined): string | null {
  if (!website || !websiteDomain(website)) return null;
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

// What a Source knows to tell one startup from another.
export type Identity = { name: string; website: string | null; uid: string | null; legalName: string | null };

export type KnownStartup<S> = S & { website: string | null; name: string; entities: { name: string; uid: string | null }[] };

// Finds the startup an Identity belongs to among those the radar knows.
export function matchStartup<S>(known: KnownStartup<S>[], identity: Identity): KnownStartup<S> | null {
  const { uid } = identity;
  if (uid) {
    const byUid = known.find((s) => s.entities.some((e) => e.uid === uid));
    if (byUid) return byUid;
  }
  const domain = websiteDomain(identity.website);
  if (domain) {
    const byWebsite = known.find((s) => websiteDomain(s.website) === domain);
    if (byWebsite) return byWebsite;
  }
  const keys = new Set([identity.name, identity.legalName].filter(Boolean).map((n) => nameKey(n!)).filter(Boolean));
  return (
    known.find((s) => {
      const theirKeys = [s.name, ...s.entities.map((e) => e.name)].map(nameKey);
      if (!theirKeys.some((k) => keys.has(k))) return false;
      // The same name on two different Legal Entities is two companies.
      const theirUids = s.entities.map((e) => e.uid).filter(Boolean);
      return !(uid && theirUids.length && !theirUids.includes(uid));
    }) ?? null
  );
}
