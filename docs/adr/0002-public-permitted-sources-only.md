# Only public, permitted Sources

Every Source must be public and allowed by its terms of use. Several obvious shortcuts are therefore deliberately off the table:

- **No LinkedIn scraping.** It breaches LinkedIn's terms and needs bot-detection evasion. It risks a ban on the Owner's own account, which is their network for VC jobs. It collects personal data at scale, and it is a bad signal to the funds the project is meant to impress. LinkedIn reaches the radar only through Quick Add.
- **No internal data from LAUNCH Rhein-Main e.V.** That means no applications, partner lists or batch internals. A LAUNCH startup appears only when it is public, and the connection is then disclosed.
- **No bulk crawling of the German Handelsregister.** There is no API or feed, lookups are limited to 60 per hour, and mass retrieval gets blocked. It is used only for single lookups on Watchlist startups.
- **No full text from news or newsletters.** Only facts and links are stored.

## SHAB terms (checked 2026-10-18)

The Amtsblattportal's general terms (SECO, 7 June 2024, https://www.shab.ch/static/agb_de.pdf) allow personal and commercial use and offer the API for transferring publication data. The API documentation states that it is freely accessible. The terms set four conditions, which Dealflow follows:

- **Source.** SHAB and the Amtsblattportal are named as the source wherever their data appears.
- **Not official.** Pages state "This is not an official publication."
- **Quotes stay separate.** Quoted SHAB text is visually separated from Dealflow's own assessment.
- **The Owner accepts the terms in person.** They are accepted before first use and again every 90 days. Claude does not accept them on the Owner's behalf.

Requests go out one at a time, at most one per second. The API is the only access path: the web front end's `robots.txt` disallows crawling.

## Consequences

Germany has no open register feed, so German discovery relies on indirect Sources: news, grants and university spin-off pages. Coverage leans toward Switzerland, where the SHAB API is open. The showcase states this openly instead of hiding it.
