import type { FeedHttp } from "./feeds";

// Feeds in the formats the real sources serve (WordPress RSS 2.0, startupticker's Atom), built from
// invented articles. Real items name founders, so test data is never copied from the live feeds.

export type RssItem = { title: string; link: string; guid: string; pubDate: string; description: string; categories?: string[] };
export type AtomEntry = { title: string; link: string; id: string; published: string; summary: string; cuid?: string };

const cdata = (s: string) => `<![CDATA[${s}]]>`;

export function rssFeed(items: RssItem[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Example feed</title>
  <link>https://news.example/</link>
  ${items
    .map(
      (i) => `<item>
    <title>${i.title}</title>
    <link>${i.link}</link>
    <dc:creator>${cdata("Redaktion")}</dc:creator>
    <pubDate>${i.pubDate}</pubDate>
    ${(i.categories ?? []).map((c) => `<category>${cdata(c)}</category>`).join("\n    ")}
    <guid isPermaLink="false">${i.guid}</guid>
    <description>${cdata(i.description)}</description>
    <content:encoded>${cdata(`<p>${i.description}</p><p>The full article text, which the radar must never keep.</p>`)}</content:encoded>
  </item>`,
    )
    .join("\n  ")}
</channel>
</rss>`;
}

export function atomFeed(entries: AtomEntry[]) {
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom feed</title>
  <link rel="self" type="application/atom+xml" href="https://ticker.example/en/rss/news" />
  <id>tag:ticker.example,2013:3</id>
  ${entries
    .map(
      (e) => `<entry>
      <title>${e.title}</title>
      <link href="${e.link}"/>
      <id>${e.id}</id>
      <updated>${e.published}</updated>
      <published>${e.published}</published>
${e.cuid ? `<cuid>${e.cuid}</cuid>` : ""}
      <summary xml:lang="en" type="html">${cdata(e.summary)}</summary>
      <tags>${cdata("Seed, Robotics")}</tags>
    </entry>`,
    )
    .join("\n  ")}
</feed>`;
}

// Serves feeds by URL and remembers which were asked for; an unknown URL fails like a network error.
export function fakeFeedHttp(byUrl: Record<string, string>): FeedHttp & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async fetchFeed(url) {
      asked.push(url);
      if (!(url in byUrl)) throw new Error(`fetch failed for ${url}`);
      return byUrl[url];
    },
  };
}
