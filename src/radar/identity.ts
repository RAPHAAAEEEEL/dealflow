// When two records are the same Startup (CONTEXT.md): the same Legal Entity, the same website, or the
// same name once the legal form is dropped. Anything less certain stays separate until a Proposal
// merges it, because a duplicate does less harm than two startups wrongly merged.

// Legal-form words that end a company name in DACH registers and elsewhere.
const LEGAL_FORM_WORDS = new Set(["gmbh", "ag", "ug", "se", "kg", "og", "ohg", "kgaa", "sa", "sarl", "ltd", "inc", "llc", "bv", "co", "eu"]);

// "Volt Mover GmbH", "VOLT MOVER" and "Volt-Mover UG (haftungsbeschränkt)" all give "volt mover".
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

// "https://www.volt-mover.de/about" gives "volt-mover.de". LinkedIn is never a company's own website.
export function websiteDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".") || host === "linkedin.com" || host.endsWith(".linkedin.com")) return null;
    return host;
  } catch {
    return null;
  }
}
