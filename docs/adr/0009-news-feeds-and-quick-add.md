# Startups beyond the Swiss register: news feeds and Quick Add

The Swiss commercial register alone finds too little, and nothing outside Switzerland. Two Sources therefore join it: startup news feeds, read daily by a scheduled job, and Quick Add, where the Owner shares what they find, mostly on LinkedIn.

## Feeds (checked 2026-10-21)

| Feed | Why | Terms |
|---|---|---|
| deutsche-startups.de, tag #Brandneu | 2–3 posts a week, each presenting 5 brand-new German startups | robots.txt allows everything; the imprint allows copies for private, non-commercial use |
| startupticker.ch | about 23 Swiss items a week, often with the company's UID | robots.txt asks for 5 seconds between requests; no clause on reuse |
| EU-Startups, Germany / Austria / Switzerland | about 8 items a week, often already past the Stage Rule | robots.txt allows everything; no terms found |

Left out: Gründerszene reserves text and data mining (§ 44b UrhG). brutkasten's terms allow processing beyond private reading only with written consent, so it waits for the publisher's yes. Trending Topics and Startbase name too few new startups.

Each item is stored with its title, link and the feed's own teaser. The full text is never stored. A #Brandneu teaser only lists the names, so Screening reads the article page once and passes its text to Claude without keeping it. The text names founders; they reach Claude only within that one call, and Claude is told to write no names into any field (docs/adr/0003). One article can name several startups; each startup Claude places in a Lane goes on the radar, and Claude's view of the others is kept with the article as evidence for Proposals. Discarded startups from articles are not shown as Near Misses yet.

## Quick Add

The Owner shares a link or text, on the iPhone through a Shortcut from the share sheet. The share arrives in the page address's fragment (after `#`), which never reaches the server or its logs. Claude drafts which company it is about, and the Owner confirms or corrects the draft before anything is stored. What the Owner adds skips Screening's veto and lands first in the Triage queue.

- LinkedIn is never opened (docs/adr/0002). A shared company page's address still tells Claude the company.
- A LinkedIn profile or post address names a person, so it is never stored. Only company pages are kept as links.
- The shared text is never stored, only the company's facts as the Owner confirmed them.
- Other shared pages and the company's own website are read once, with an honest user agent.

## One startup, several Sources

Two records are the same Startup when they share a Legal Entity (the Swiss UID), a website domain, or the name once the legal form is dropped ("Volt Mover GmbH" is "Volt Mover"). Anything less certain stays separate until a Proposal merges it: a duplicate does less harm than two startups wrongly merged.

## Consequences

- German and Austrian startups reach the radar for the first time. Austria stays thin until brutkasten agrees.
- Quick Add runs Claude from the deployed app, so Vercel needs the Claude API key too. The monthly cap (docs/adr/0005) covers the jobs and Quick Add together.
- The feeds job is another scheduled workflow that GitHub's 60-day stop switches off; the Status Check and the Feed warn when it hasn't run for two days.
