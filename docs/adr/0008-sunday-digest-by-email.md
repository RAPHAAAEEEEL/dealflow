# The Sunday Digest: plain-text email through Resend, sent by a scheduled GitHub Action

Every Sunday at 17:00 UTC a GitHub Action builds the Digest from the database and emails it to the Owner: the Candidates waiting for Triage, the week's Near Misses and the Status Check. It is where the Owner notices when the radar silently stops, for example because GitHub turned off the SHAB schedule (docs/adr/0007) or the SHAB terms ran out (docs/adr/0002). A SHAB run refused for lapsed terms is recorded with that reason, so the Digest names it instead of reporting a missing run.

The Digest is a scheduled workflow in the same repository, so GitHub's 60-day stop switches it off together with the SHAB job. The Feed therefore shows the same run warnings whenever the Owner opens it: a Sunday without a Digest, or a warning in the Feed, both mean "check GitHub Actions". Keep-alive workarounds that fake repository activity are not used.

The email goes out through Resend's HTTP API, on the free plan, from Resend's test sender. That sender delivers only to the address the Resend account was opened with. For a single Owner this is enough, and it needs no domain of its own and no DNS records. A verified domain only becomes necessary if the Digest ever goes to someone else.

The email is plain text. It is read on a phone, and plain text needs no template, renders the same everywhere and can be tested as a string.

## Consequences

- The Digest names companies and quotes Claude's reasons, also for discarded entries. It goes only to the Owner and never into a public log: the Action logs only whether it was sent and how many warnings it had, and Resend's error texts, which can contain the recipient's address, are reduced to their status code.
- Resend keeps a copy of each email it sends. The content is public register data plus the radar's own assessments, with no founder names (docs/adr/0003), which is acceptable for a processor.
- The Owner's address is stored as a GitHub secret, not in the repository.
- The Status Check flags each SHAB register day of the past week without a successful run, rather than only a stale last run, so a single missed day is caught too.
