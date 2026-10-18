# Dealflow

A personal sourcing radar for early-stage startups in Germany, Austria and Switzerland, and an honest track record of my own calls on them.

I built it to learn deal sourcing by doing it: find startups before their first institutional round, judge them against a written thesis, put a dated probability on what happens next, and let reality score me. The radar and my notes are private; funds I talk to see a curated selection and the track record.

## The thesis: three lanes

The radar only looks for startups in three lanes, each taken from a thesis I hold:

- **Specialised Robotics.** Specialised robots will win before humanoids do. The winners are robots that do one painful job better than anyone.
- **Enterprise Agents.** Enterprise AI will be won in the layer nobody demos. The defensible companies sit on proprietary process data, not on the better model.
- **Deep-Tech Manufacturing.** In deep tech, making is the bottleneck. The bet is on the machines for the making step.

What counts as in or out of each lane is written down in [criteria/screening-criteria.md](criteria/screening-criteria.md). The file is versioned, and every screening result records the version it was judged against.

## How it works

1. **Sources** deliver raw publications. Today that is the Swiss commercial-register gazette (SHAB): every new company registered in Switzerland.
2. **Screening** discards everything that can't take venture money (only an AG or a GmbH can) for free. Claude Haiku then judges the rest against the lane definitions, for an estimated $1 a month.
3. **Candidates** land on the radar with their lane, a one-line description and a priority for my weekly review.
4. **Triage**. Once a week I decide on each candidate (Track, Pass or Out of Scope) and make a **Call**: my probability that the startup raises an institutional round within 12 months, and Series A within 36 months.
5. **Outcomes** *(later)*. A watchlist checks whether those rounds happen, and each Call resolves to yes or no.
6. **Track record** *(later)*. Hit rate, calibration and lead time: how many days before the public announcement I was convinced.

## Rules that keep the track record honest

- **Only I make Calls.** Claude researches, drafts and suggests; it never decides. Backtest scores never count.
- **The first Call counts.** I can revise my view, but a revision never replaces the first Call in the record.
- **Passes count too.** Startups I passed on and that raised anyway form the anti-portfolio, which is where most of the learning is.
- **No credit for hindsight.** A Call is void if the round is announced within 30 days, because it was most likely closed already.
- **Fixed definitions.**
  - An institutional round is at least €500k in equity or equity-like instruments, led by a professional investor.
  - Series A is a round labelled so, or one of at least €5M.

## Sources and privacy

- **Public and permitted sources only.** There is no LinkedIn scraping; LinkedIn reaches the radar only when I paste a link by hand.
- **The register's terms are followed.** The SHAB data is used under its terms: the source is named, it is marked as not an official publication, and requests are throttled.
- **No founder names.** The radar keeps anonymous team profiles. Names appear only once I'm in contact with someone.
- **Germany has no open company register.** German coverage relies on indirect sources (news, grants, university spin-offs), so the radar currently leans Swiss.

The reasoning behind these choices is in [docs/adr](docs/adr). The domain vocabulary is in [CONTEXT.md](CONTEXT.md).

## Status

| Version | Content | Status |
|---|---|---|
| v1 | SHAB screening onto the radar | ✅ built and tested |
| v1 | Triage with Scorecard and Calls, mobile Feed, sortable table | ✅ built and tested |
| v1 | Deployment: hosted database, scheduled runs, single login | next |
| v1 | Second source (#Brandneu news feed), Quick Add, weekly email | planned |
| v2 | Newsletter inbox, watchlist and outcomes, track record, per-fund views | planned |
| v3 | Backtest on 2022–23 cohorts, more sources, learning loops for screening and prediction | planned |

## Running it locally

You need Node 24. No database server and no account are needed for development: Postgres runs in-process.

```bash
npm install
npm test              # SHAB and Claude are faked, no network needed
npm run dev           # the radar at http://localhost:3000
```

To screen real registrations, copy `.env.example` to `.env.local` and fill in a Claude API key and the date you accepted the [SHAB terms](https://www.shab.ch/static/agb_de.pdf). Then, with the dev server stopped:

```bash
npm run job:shab -- 2026-10-16
```

## Stack

Next.js and TypeScript, Postgres (PGlite locally) with Drizzle, Vitest, and Claude Haiku 5.5 through the Anthropic SDK. The design process behind it is recorded in the repo: an interview to pin down the plan, a domain model, a throwaway UI prototype (branch `prototype/radar-ui`), test-first slices and a two-axis code review after each slice. Claude API spend is capped at $10 a month in code.
