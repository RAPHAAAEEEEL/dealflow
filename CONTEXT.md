# Dealflow

A personal sourcing radar for early DACH startups in three thesis Lanes, plus a track record of the Owner's own dated Calls on them. It exists to learn deal sourcing and to show that judgement to VC funds.

## Language

### People

**Owner**:
The one person who runs the radar, does Triage and makes Calls.
_Avoid_: User, analyst, admin

**Team Profile**:
Anonymous attributes of a startup's founding team, such as "PhD in robotics at ETH, ten years in industry", without names.
_Avoid_: Founder data, people

**Contact**:
A named founder the Owner is personally in touch with. Contacts are the only place where names are stored.
_Avoid_: Lead, person, founder record

### Sourcing

**Lane**:
One of three thesis-driven search tracks: Specialised Robotics, Enterprise Agents, Deep-Tech Manufacturing.
_Avoid_: Track, sector, vertical, thesis

**Screening Criteria**:
The versioned rules, approved by the Owner, that decide whether something belongs in a Lane (the Lane Definitions) and is early enough (the Stage Rule).
_Avoid_: Filter rules, prompt

**Stage Rule**:
The part of the Screening Criteria that defines "early enough": before or around a startup's first Institutional Round.
_Avoid_: Phase filter

**Source**:
A public, permitted origin of Sightings, such as the Swiss commercial register gazette (SHAB), a news feed, a newsletter inbox or Quick Add.
_Avoid_: Feed, provider, scraper

**Quick Add**:
A Source the Owner feeds by hand. The Owner pastes a link or text, for example from LinkedIn, and the radar fills in the rest from open sources.
_Avoid_: Manual entry, import

**Sighting**:
One raw publication from a Source that might concern a startup, before Screening has judged it.
_Avoid_: Item, document, lead

**Screening**:
The automatic check of a Sighting against the Screening Criteria. It either turns the Sighting into a Signal on a startup or discards it.
_Avoid_: Filtering, classification

**Startup**:
A young venture that the radar tracks, independent of its legal form or name changes. It has one primary Lane and at most one secondary Lane.
_Avoid_: Company (on raphael.at that word means a Target Fund), deal, lead

**Legal Entity**:
A registered company (GmbH, UG, AG and so on) belonging to a startup. A startup can have none (a team still "in creation") or several, for example a Swiss parent and a German subsidiary.
_Avoid_: Company, firm, registration

**Signal**:
A dated fact about a startup taken from a Sighting, such as a registration, a grant, a launch or a first hire.
_Avoid_: Event, update, news

**Timeline**:
The chronological record of everything about one startup: its Signals, Triage decisions, Calls and Outcomes.
_Avoid_: History, log, feed

### Triage and Calls

**Candidate**:
A startup that passed Screening and waits for the Owner's Triage.
_Avoid_: Lead, prospect

**Priority**:
The radar's ranking of Candidates for Triage. It is not a judgement of quality.
_Avoid_: Score, rating

**Triage**:
The Owner's weekly review of at most 15 Candidates.
_Avoid_: Review, screening

**Expired**:
The state of a Candidate that waited four weeks without Triage. It is archived, not deleted, and has no Call.
_Avoid_: Archived, rejected, passed

**Track**:
The Triage decision to follow a startup closely. It requires a Call and leads to a Memo.
_Avoid_: Yes, accept, invest

**Pass**:
The Triage decision not to pursue a startup. It still requires a Call.
_Avoid_: No, reject, decline

**Out of Scope**:
The Triage decision that Screening was wrong, because the startup is outside the Lanes or past the Stage Rule. There is no Call; the decision feeds Proposals to the Screening Criteria.
_Avoid_: Irrelevant, spam, false positive

**Call**:
The Owner's dated probability that a Claim about a startup comes true, with a one-line rationale and a Scorecard. A Call never changes after it is made.
_Avoid_: Prediction, bet, forecast, rating

**Revision**:
A later Call on the same startup and Claim. It appears on the Timeline but does not replace the first Call in the Track Record.
_Avoid_: Update, edit, correction

**Claim**:
The fixed statement that a Call puts a probability on. There are two: "raises an Institutional Round within 12 months" and "reaches Series A within 36 months".
_Avoid_: Question, target, hypothesis

**Scorecard**:
The Owner's 1–5 rating of a startup on seven Factors, captured with each Call.
_Avoid_: Score, rating

**Factor**:
One dimension of the Scorecard: Team–Problem Fit, Defensibility, Market & Timing, Early Evidence, Lane Fit, Fundability or Momentum. The radar computes Momentum; the Owner sets the rest.
_Avoid_: Criterion, metric

**Memo**:
A written investment case for a startup the Owner Tracks. Claude does the research and drafts it; the judgement in it is the Owner's.
_Avoid_: Report, profile, write-up

**Watchlist**:
All startups with at least one unresolved Call. The radar checks these for Institutional Rounds.
_Avoid_: Portfolio, pipeline

### Outcomes and Track Record

**Institutional Round**:
A financing round of at least €500k in equity or equity-like instruments (including SAFEs and convertible loans), led by a professional investor such as a VC, a corporate VC or a public VC like HTGF or the EIC Fund. Angel-only rounds, grants, debt and crowdfunding do not count.
_Avoid_: Funding, raise, investment

**Series A**:
A round labelled Series A, or an Institutional Round of at least €5M, whichever comes first.
_Avoid_: Big round, growth round

**Outcome**:
The settled truth of a Claim, yes or no, with dated evidence. A startup dissolved or acquired before the deadline resolves to no.
_Avoid_: Result, verdict, resolution

**Void**:
The state of a Call whose Institutional Round was announced within 30 days after the Call, so the round was most likely already closed. It counts neither as a hit nor as a miss.
_Avoid_: Cancelled, invalid, excluded

**Lead Time**:
Days from the Owner's first Call of at least 50% on a startup to the announcement of its Institutional Round.
_Avoid_: Head start, time to round

**Discovery Lead Time**:
Days from a startup's first Sighting to the announcement of its Institutional Round. It measures the radar, not the Owner.
_Avoid_: Lead Time (that word is reserved for the Owner's conviction)

**Track Record**:
The Owner's scored history of resolved Calls: hit rate, calibration and Lead Time. Only the first Call per startup and Claim counts.
_Avoid_: Performance, stats

**Anti-Portfolio**:
The startups the Owner Passed on that went on to raise an Institutional Round.
_Avoid_: Misses, regrets

### Learning

**Proposal**:
A change the radar suggests with evidence: to the Screening Criteria, to the Factor weights, or merging two records into one startup. It takes effect only when the Owner accepts it.
_Avoid_: Suggestion, auto-update

**Backtest**:
A one-off scoring, by the radar and never by the Owner, of startups that were at the right stage in 2022–2023 and whose fate is known today. It produces Backtest Scores, which are never Calls and never count in the Track Record.
_Avoid_: Simulation, training

### Sharing

**Target Fund**:
A VC fund the Owner applies to, together with its investment focus.
_Avoid_: Company, employer, investor

**Shareable**:
The Owner's explicit mark that a startup may appear in Fund Views. Nothing is Shareable by default.
_Avoid_: Public, showable, visible

**Fund View**:
The curated selection for one Target Fund: Shareable startups ranked against its focus, plus the aggregated Track Record.
_Avoid_: Report, dashboard, deal list
