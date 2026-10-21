import { describe, expect, test } from "vitest";
import { createFeedSource, FEEDS } from "./feeds";
import { atomFeed, fakeFeedHttp, rssFeed } from "./feeds.testing";

describe("Feed source", () => {
  test("reads a WordPress RSS feed into Sightings with the feed's own teaser, never the full text", async () => {
    const http = fakeFeedHttp({
      [FEEDS["deutsche-startups"].url]: rssFeed([
        {
          title: "#Brandneu – 5 neue Startups: Beispiel Kran, Beispiel Prüf &amp; Co",
          link: "https://news.example/2026/10/20/beispiel-kran/",
          guid: "https://news.example/?p=1001",
          pubDate: "Tue, 20 Oct 2026 11:55:00 +0000",
          description: "Wir präsentieren heute frische Startups: Beispiel Kran und Beispiel Prüf.",
          categories: ["brandneu", "Beispiel Kran", "Berlin"],
        },
      ]),
    });

    expect(await createFeedSource(http).fetchSightings("deutsche-startups")).toEqual([
      {
        source: "deutsche-startups.de",
        feed: "deutsche-startups",
        externalId: "https://news.example/?p=1001",
        publishedOn: "2026-10-20",
        url: "https://news.example/2026/10/20/beispiel-kran/",
        title: "#Brandneu – 5 neue Startups: Beispiel Kran, Beispiel Prüf & Co",
        teaser: "Wir präsentieren heute frische Startups: Beispiel Kran und Beispiel Prüf.",
        uid: null,
      },
    ]);
  });

  test("reads startupticker's Atom feed despite its broken dates, and keeps the Swiss company number it gives", async () => {
    const http = fakeFeedHttp({
      [FEEDS.startupticker.url]: atomFeed([
        {
          title: "Beispiel Robotik raises a pre-seed round",
          link: "https://ticker.example/en/news/beispiel-robotik-pre-seed",
          id: "https://ticker.example/en/news/beispiel-robotik-pre-seed",
          published: "2026-10-21CEST00:25:00+02:00",
          summary: "The ETH spin-off <b>Beispiel Robotik</b> builds rebar-laying robots.",
          cuid: "CHE-100.000.001",
        },
      ]),
    });

    expect(await createFeedSource(http).fetchSightings("startupticker")).toEqual([
      {
        source: "startupticker.ch",
        feed: "startupticker",
        externalId: "https://ticker.example/en/news/beispiel-robotik-pre-seed",
        publishedOn: "2026-10-21",
        url: "https://ticker.example/en/news/beispiel-robotik-pre-seed",
        title: "Beispiel Robotik raises a pre-seed round",
        teaser: "The ETH spin-off Beispiel Robotik builds rebar-laying robots.",
        uid: "CHE-100.000.001",
      },
    ]);
  });

  test("drops the publisher's own footer and keeps a teaser short", async () => {
    const long = "Beispiel Labor automates materials experiments. ".repeat(30);
    const http = fakeFeedHttp({
      [FEEDS["eu-startups-de"].url]: rssFeed([
        {
          title: "Beispiel Labor raises €1.5M",
          link: "https://eu.example/2026/10/beispiel-labor/",
          guid: "https://eu.example/?p=2001",
          pubDate: "Wed, 21 Oct 2026 08:23:10 +0000",
          description: `<p>${long}[&#8230;]</p>\n<p>The post <a href="https://eu.example/2026/10/beispiel-labor/">Beispiel Labor raises €1.5M</a> appeared first on <a href="https://eu.example">EU-Startups</a>.</p>`,
        },
      ]),
    });

    const [sighting] = await createFeedSource(http).fetchSightings("eu-startups-de");

    expect({ source: sighting.source, length: sighting.teaser.length, footer: sighting.teaser.includes("appeared first") }).toEqual({
      source: "EU-Startups",
      length: 600,
      footer: false,
    });
  });
});
