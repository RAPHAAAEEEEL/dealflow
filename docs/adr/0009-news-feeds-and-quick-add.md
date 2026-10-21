# Startups beyond the Swiss register: news feeds and Quick Add

The Swiss commercial register alone finds too little, and nothing outside Switzerland. Two Sources therefore join it: startup news feeds, read daily by a scheduled job, and Quick Add, where the Owner shares what they find, mostly on LinkedIn.

## Feeds (checked 2026-10-21)

| Feed | Why | Terms |
|---|---|---|
| deutsche-startups.de, tag #Brandneu | 2–3 posts a week, each presenting 5 brand-new German startups | robots.txt allows everything; the imprint allows copies for private, non-commercial use |
| startupticker.ch | about 23 Swiss items a week, often with the company's UID | robots.txt asks for 5 seconds between requests; no clause on reuse |
| EU-Startups, Germany / Austria / Switzerland | about 8 items a week, often already past the Stage Rule | robots.txt allows everything; no terms found |

Left out: Gründerszene reserves text and data mining (§ 44b UrhG). brutkasten's terms allow processing beyond private reading only with written consent, so it waits for the publisher's yes. Trending Topics and Startbase name too few new startups.

Each item is stored with its link. Its title and the feed's own teaser are kept only until the item is screened, because publisher text often names founders (docs/adr/0003); the full text is never stored. A #Brandneu teaser only lists the names, so Screening reads the article page once and passes its text to Claude without keeping it. Founders' names in that text reach Claude within that one call, and Claude is told to write no names into any field. One article can name several startups; each startup Claude places in a Lane goes on the radar, and Claude's view of the others is kept with the article as evidence for Proposals. Discarded startups from articles are not shown as Near Misses yet.

## Quick Add

The Owner shares a link or text, on the iPhone through a Shortcut from the share sheet. The share arrives in the page address's fragment (after `#`), which never reaches the server or its logs. Claude drafts which startup it is about, and the Owner confirms or corrects the draft before anything is stored. What the Owner adds skips Screening's veto and lands first in the Triage queue.

- LinkedIn is never opened (docs/adr/0002). A shared company page's address still tells Claude the startup.
- A LinkedIn profile or post address names a person, so it is never stored. Only company pages are kept as links.
- The shared text is never stored, only the startup's facts as the Owner confirmed them.
- Other shared pages and the startup's own website are read once, with an honest user agent. Every redirect hop is checked, so a short link to LinkedIn is refused too, and no address on a private network is opened, whatever name points there.

## One startup, several Sources

Two records are the same Startup when they share a Legal Entity (the Swiss UID), a website domain, or the name once the legal form is dropped ("Volt Mover GmbH" is "Volt Mover"). The same name on two different Legal Entities is two companies. Domains that many companies share by path, such as linktr.ee or github.com, and the news sites themselves never count as a startup's website. Anything less certain stays separate until a Proposal merges it: a duplicate does less harm than two startups wrongly merged.

startupticker gives the Swiss UID of the company an item is about. It only helps find a startup the radar knows, when the item names a single startup; it never creates a Legal Entity, since the item may be about a corporate or an investor.

## Consequences

- German and Austrian startups reach the radar for the first time. Austria stays thin until brutkasten agrees.
- Quick Add runs Claude from the deployed app, so Vercel needs the Claude API key too. The monthly cap (docs/adr/0005) covers the jobs and Quick Add together. Each process reads the month's spend when it starts, so a Quick Add during a job run can pass the cap by the cost of a few calls, a fraction of a cent.
- The feeds job is another scheduled workflow that GitHub's 60-day stop switches off; the Status Check and the Feed warn when it hasn't run for two days.
