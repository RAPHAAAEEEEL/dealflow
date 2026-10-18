# Deployment: Vercel and Neon in Frankfurt, the Owner's GitHub id, counts-only CI logs

The radar runs on Vercel (region fra1) with a Neon Postgres in Frankfurt, so the data stays in the EU. Development and tests keep using PGlite in-process with no accounts; the code switches to the hosted database when `DATABASE_URL` is set. Hosted migrations run only in a production build. A preview build skips them, so a branch can't change production's schema, and a production build without `DATABASE_URL` fails rather than deploying a radar with no data.

Only the Owner gets in, through GitHub sign-in (Auth.js). The check matches the numeric GitHub account id, not the login: a login can be renamed and then taken by someone else. A deployment without sign-in configured stays shut; only a developer's machine runs open. Every page and every write checks the Owner itself. `proxy.ts` only redirects visitors without a session.

The SHAB job runs as a scheduled GitHub Action, Tuesday to Saturday at 05:30 UTC (06:30 in Switzerland in winter, 07:30 in summer), for the previous publication day, and only from `main`. The repository is public, so its Actions logs are public too. The log carries counts only: no company names and no error texts, since database errors include their query parameters. Every run's full report, including runs that break off, is stored in `job_runs` for the Owner and the weekly status check.

## Consequences

- GitHub turns off scheduled workflows in a public repository after 60 days without activity. The weekly status check has to report missing runs.
- Re-accepting the SHAB terms every 90 days means updating the `SHAB_TERMS_ACCEPTED_ON` variable. Until then the job refuses to run, and GitHub reports the failed run by email.
