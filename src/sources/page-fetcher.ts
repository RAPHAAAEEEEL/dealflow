import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isLinkedIn } from "@/radar/identity";
import type { PageFetcher } from "./quick-add";
import { spaced } from "./spacing";

// The radar names itself honestly; some sites turn away browser look-alikes but serve an open bot.
export const USER_AGENT = "DealflowRadar/0.1 (+https://github.com/RAPHAAAEEEEL/dealflow)";

const TIMEOUT_MS = 10_000;
const MAX_HTML_CHARS = 1_000_000;
const MAX_REDIRECTS = 3;

type Lookup = (host: string) => Promise<string[]>;
const resolveAll: Lookup = async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address);

// Opens one public web page and returns its readable text: pages the Owner shared, a startup's own
// website, and articles a feed only names. Every hop of a redirect is checked: LinkedIn is never opened
// (docs/adr/0002), and neither is an address on a private network, whatever name points there. A job
// passes `minIntervalMs` so that its requests go out spaced apart.
export function createPageFetcher({
  minIntervalMs = 0,
  fetchImpl = fetch,
  lookup = resolveAll,
}: { minIntervalMs?: number; fetchImpl?: typeof fetch; lookup?: Lookup } = {}): PageFetcher {
  const nextRequest = spaced(minIntervalMs);
  return {
    async fetchText(url) {
      let target = new URL(url);
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertOpenable(target, lookup);
        await nextRequest();
        const response = await fetchImpl(target, {
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,text/plain" },
          redirect: "manual",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const location = response.headers.get("location");
        if (response.status >= 300 && response.status < 400 && location) {
          target = new URL(location, target);
          continue;
        }
        if (!response.ok) throw new Error(`${target.hostname} answered ${response.status}`);
        const type = response.headers.get("content-type") ?? "";
        if (!/html|text\/plain/.test(type)) throw new Error(`${target.hostname} sent ${type || "no content type"}, not a page`);
        return htmlToText(await readUpTo(response, MAX_HTML_CHARS));
      }
      throw new Error(`${url} redirects more than ${MAX_REDIRECTS} times`);
    },
  };
}

async function assertOpenable(target: URL, lookup: Lookup) {
  if (!/^https?:$/.test(target.protocol)) throw new Error(`Won't open ${target.protocol} addresses`);
  if (isLinkedIn(target.href)) throw new Error("LinkedIn is never opened");
  const host = target.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await lookup(host);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error(`Won't open ${target.hostname}: not a public address`);
}

// Loopback, private, link-local and shared address space, IPv4 also inside IPv6.
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase();
  const mapped = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(ip);
  if (mapped) {
    const v4 = mapped[1] ?? [parseInt(mapped[2], 16) >> 8, parseInt(mapped[2], 16) & 255, parseInt(mapped[3], 16) >> 8, parseInt(mapped[3], 16) & 255].join(".");
    return isPrivateAddress(v4);
  }
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return ip === "::" || ip === "::1" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
}

// Reads at most `limit` characters, so a huge page never fills the memory.
async function readUpTo(response: Response, limit: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (text.length < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text.slice(0, limit);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// The text a reader sees: title, meta description and body, without scripts, styles or markup.
export function htmlToText(html: string): string {
  const description = /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1];
  const body = html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(br|p|div|li|h[1-6]|tr|section|article|header|footer|title)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return [description, body]
    .filter(Boolean)
    .join("\n")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] === "#") return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? entity;
    })
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
