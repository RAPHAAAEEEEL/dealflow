# One TypeScript stack, independent of vc-radar

Dealflow is a single TypeScript codebase: a Next.js app on Vercel at a raphael.at subdomain, a Postgres database and scheduled GitHub Actions for the pipeline jobs. The Owner's other radars (`vc-radar`, `saas-radar`) are Python, but the Owner wants the radar on their own site, already runs raphael.at on Next.js and Vercel, and wants as few moving parts as possible once it is built. Dealflow neither reads from nor depends on `vc-radar`; it checks its own Watchlist for Institutional Rounds.

## Considered Options

- A Python pipeline with a Next.js front end, using the database as the contract between them. Rejected: two languages for one person to maintain.
- Python with Streamlit, like `vc-radar`. Rejected: it looks like a dashboard, not like the Owner's site.

## Consequences

Merging with `vc-radar` later means porting its logic to TypeScript. That is accepted: Dealflow is a deliberate fresh start rather than an extension of `vc-radar`.
