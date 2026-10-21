import { XMLParser } from "fast-xml-parser";
import { dayOf } from "@/dates";
import type { ArticleSighting } from "@/sighting";
import { htmlToText } from "./page-fetcher";

// The startup news feeds the radar reads (docs/adr/0009). Each item is stored with its link, and its title
// and the feed's own teaser only until it is screened; the full text is never kept. `readArticle` marks feeds whose teaser only names
// the startups, so Screening reads the article page once to judge them.
export const FEEDS = {
  "deutsche-startups": {
    name: "deutsche-startups.de",
    label: "deutsche-startups.de #Brandneu",
    url: "https://www.deutsche-startups.de/tag/brandneu/feed/",
    readArticle: true,
  },
  startupticker: { name: "startupticker.ch", label: "startupticker.ch", url: "https://www.startupticker.ch/en/rss/news", readArticle: false },
  "eu-startups-de": {
    name: "EU-Startups",
    label: "EU-Startups Germany",
    url: "https://www.eu-startups.com/category/germany-startups/feed/",
    readArticle: false,
  },
  "eu-startups-at": {
    name: "EU-Startups",
    label: "EU-Startups Austria",
    url: "https://www.eu-startups.com/category/austria-startups/feed/",
    readArticle: false,
  },
  "eu-startups-ch": {
    name: "EU-Startups",
    label: "EU-Startups Switzerland",
    url: "https://www.eu-startups.com/category/switzerland-startups/feed/",
    readArticle: false,
  },
} as const;
export type FeedId = keyof typeof FEEDS;
export const FEED_IDS = Object.keys(FEEDS) as FeedId[];
export const ARTICLE_SOURCES = [...new Set(Object.values(FEEDS).map((f) => f.name))];

// The one call a feed needs, returning the raw body.
export type FeedHttp = { fetchFeed(url: string): Promise<string> };

const TEASER_CHARS = 600;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["item", "entry", "link", "category"].includes(name),
});

export function createFeedSource(http: FeedHttp) {
  return {
    async fetchSightings(feed: FeedId): Promise<ArticleSighting[]> {
      const doc = parser.parse(await http.fetchFeed(FEEDS[feed].url));
      if (doc.rss) return (doc.rss.channel?.item ?? []).map((item: RssItem) => fromRss(feed, item));
      if (doc.feed) return (doc.feed.entry ?? []).map((entry: AtomEntry) => fromAtom(feed, entry));
      throw new Error(`${FEEDS[feed].name} sent neither RSS nor Atom`);
    },
  };
}

type Text = string | { "#text"?: string };
type RssItem = { title: Text; link: Text[]; guid?: Text; pubDate?: string; description?: Text };
type AtomEntry = { title: Text; link: { "@href": string; "@rel"?: string }[]; id: Text; published?: string; updated?: string; summary?: Text; cuid?: Text };

const textOf = (t: Text | undefined) => (typeof t === "string" ? t : (t?.["#text"] ?? ""));
const plain = (html: string) => htmlToText(html).replace(/\n/g, " ");

// The publisher's own footer, such as "The post … appeared first on EU-Startups."
const withoutFooter = (text: string) => text.replace(/\s*The post .* appeared first on .*$/s, "").trim();

const teaserOf = (html: string) => withoutFooter(plain(html)).slice(0, TEASER_CHARS);

function fromRss(feed: FeedId, item: RssItem): ArticleSighting {
  const url = textOf(item.link[0]);
  return {
    source: FEEDS[feed].name,
    feed,
    externalId: textOf(item.guid) || url,
    publishedOn: dayOf(new Date(item.pubDate ?? Date.now())),
    url,
    title: plain(textOf(item.title)),
    teaser: teaserOf(textOf(item.description)),
    uid: null,
  };
}

function fromAtom(feed: FeedId, entry: AtomEntry): ArticleSighting {
  const link = entry.link.find((l) => !l["@rel"] || l["@rel"] === "alternate") ?? entry.link[0];
  const uid = textOf(entry.cuid);
  return {
    source: FEEDS[feed].name,
    feed,
    externalId: textOf(entry.id) || link["@href"],
    // startupticker writes dates like 2026-10-21CEST00:25:00+02:00; the day it names is the publisher's day.
    publishedOn: (entry.published ?? entry.updated ?? dayOf(new Date())).slice(0, 10),
    url: link["@href"],
    title: plain(textOf(entry.title)),
    teaser: teaserOf(textOf(entry.summary)),
    uid: /^CHE-\d{3}\.\d{3}\.\d{3}$/.test(uid) ? uid : null,
  };
}
