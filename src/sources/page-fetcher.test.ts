import { describe, expect, test } from "vitest";
import { htmlToText } from "./page-fetcher";

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
