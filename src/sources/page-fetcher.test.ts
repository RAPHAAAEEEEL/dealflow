import { describe, expect, test } from "vitest";
import { createPageFetcher, htmlToText } from "./page-fetcher";

describe("Page text", () => {
  test("keeps what a reader sees and drops scripts, styles and markup", () => {
    const html = `<!doctype html><html><head><title>Volt Mover – Yard robots</title>
      <meta name="description" content="Autonomous tugs for logistics yards.">
      <style>body { color: red }</style><script>track("visit")</script></head>
      <body><nav><a href="/">Home</a></nav><h1>Move trailers &amp; save&nbsp;time</h1>
      <p>Based in Berlin.<br>Founded 2025 &#8211; pre-seed.</p><!-- hidden --></body></html>`;

    expect(htmlToText(html)).toBe(
      "Autonomous tugs for logistics yards.\nVolt Mover – Yard robots\nHome\nMove trailers & save time\nBased in Berlin.\nFounded 2025 – pre-seed.",
    );
  });
});

// The network is the boundary here: a fake fetch serves responses, a fake lookup resolves names.
function fakeWeb(responses: Record<string, { status: number; location?: string; body?: string }>, addresses: Record<string, string[]> = {}) {
  const asked: string[] = [];
  const fetchImpl = (async (input: URL | string) => {
    const url = String(input);
    asked.push(url);
    const r = responses[url];
    if (!r) throw new Error(`unexpected request to ${url}`);
    const headers = new Headers({ "content-type": "text/html" });
    if (r.location) headers.set("location", r.location);
    return new Response(r.body ?? "", { status: r.status, headers });
  }) as typeof fetch;
  const lookup = async (host: string) => addresses[host] ?? ["93.184.216.34"];
  return { fetcher: createPageFetcher({ fetchImpl, lookup }), asked };
}

describe("Page fetcher", () => {
  test("follows a redirect to a public page", async () => {
    const { fetcher } = fakeWeb({
      "https://volt-mover.de/": { status: 301, location: "/en/" },
      "https://volt-mover.de/en/": { status: 200, body: "<p>Yard robots.</p>" },
    });

    expect(await fetcher.fetchText("https://volt-mover.de/")).toBe("Yard robots.");
  });

  test("never follows a link to LinkedIn, also behind a short link", async () => {
    const { fetcher, asked } = fakeWeb({ "https://short.example/x": { status: 302, location: "https://www.linkedin.com/in/max-muster/" } });

    await expect(fetcher.fetchText("https://short.example/x")).rejects.toThrow("LinkedIn is never opened");
    expect(asked).toEqual(["https://short.example/x"]);
  });

  test.each([
    ["http://127.0.0.1/admin", {}],
    ["http://[::ffff:7f00:1]/", {}],
    ["https://intranet.example/", { "intranet.example": ["10.1.2.3"] }],
    ["https://rebind.example/", { "rebind.example": ["93.184.216.34", "fd00::1"] }],
  ])("never opens an address on a private network (%s)", async (url, addresses) => {
    const { fetcher, asked } = fakeWeb({}, addresses);

    await expect(fetcher.fetchText(url)).rejects.toThrow("not a public address");
    expect(asked).toEqual([]);
  });
});
