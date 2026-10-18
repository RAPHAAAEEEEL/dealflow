# UI layout

Decided on 2026-10-18 after clicking through three throwaway variants. The full prototype lives on the branch `prototype/radar-ui` (`prototype/radar-ui.prototype.html`), not on main.

The radar uses three views, each where it is strongest:

- **Radar map (desktop home and showcase image).** Lanes are sectors and stages are rings. A new startup appears at the rim (Pre-round) and moves inward as it gets closer to its Institutional Round. Startups with a Signal in the last 7 days pulse. A side panel lists this week's new Signals and starts a guided Triage that walks through the Candidates on the map.
- **Feed (mobile, for the weekly Triage).** Triage happens inline in the cards: Track, Pass or Out of Scope, with the Call and a one-line rationale. Bottom navigation: Feed, Startups, Record.
- **Table (all startups, desktop).** A sortable, filterable list. On mobile it becomes the searchable list under "Startups".

Defaults proposed on top of the prototype, open to change while building:

- In the feed, open Candidates come first, sorted by Priority; Signals and Outcomes follow by date. In the prototype the feed was purely chronological, so the most important Candidate could sit far down.
- There is one responsive startup profile: the stage stepper from the radar variant, then Calls and Scorecard, a vertical Timeline, the Team Profile and the Legal Entities.
- On desktop, Track Record shows the headline numbers plus the calibration chart; on mobile, the stacked numbers and calibration bars.
