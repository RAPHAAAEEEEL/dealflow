import type { PageFetcher } from "./quick-add";

// The radar names itself honestly; some sites turn away browser look-alikes but serve an open bot.
export const USER_AGENT = "DealflowRadar/0.1 (+https://github.com/RAPHAAAEEEEL/dealflow)";

const TIMEOUT_MS = 10_000;
const MAX_HTML_CHARS = 1_000_000;

// Opens one public web page and returns its readable text. Used for pages the Owner shared and for a
// company's own website, never for LinkedIn (docs/adr/0002).
export function createPageFetcher(): PageFetcher {
  return {
    async fetchText(url) {
      const target = new URL(url);
      if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) throw new Error(`Won't open ${url}`);
      const response = await fetch(target, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,text/plain" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`${target.hostname} answered ${response.status}`);
      const type = response.headers.get("content-type") ?? "";
      if (!/html|text\/plain/.test(type)) throw new Error(`${target.hostname} sent ${type || "no content type"}, not a page`);
      return htmlToText((await response.text()).slice(0, MAX_HTML_CHARS));
    },
  };
}

// The server never opens addresses on its own network.
function isPrivateHost(host: string) {
  return /^(localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/i.test(host);
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
