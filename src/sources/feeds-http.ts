import type { FeedHttp } from "./feeds";
import { USER_AGENT } from "./page-fetcher";

// startupticker asks crawlers for 5 seconds between requests in its robots.txt; every feed gets the same.
const MIN_INTERVAL_MS = 5000;

// The real feeds, one request at a time. startupticker serves its Atom feed as text/html, so the
// content type isn't checked; the parser refuses anything that is neither RSS nor Atom.
export function createFeedHttp(): FeedHttp {
  let lastRequest = 0;
  return {
    async fetchFeed(url) {
      const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequest = Date.now();
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`answered ${response.status}`);
      return response.text();
    },
  };
}
