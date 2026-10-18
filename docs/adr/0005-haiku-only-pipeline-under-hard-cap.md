# Haiku-only pipeline under a hard monthly cap

API spend is capped at $10 a month (about €9), and the cap is enforced in code: a run never starts a Claude call that would push the month's recorded spend past the cap, and every billed call is recorded, including ones whose answer turned out unusable. The unattended pipeline uses only Claude Haiku for Screening. Heavier work happens in Claude Code sessions on the Owner's subscription, usually around Triage: Memo drafts, deep research, the Backtest and, later, call transcripts. That is why the pipeline does not write Memos itself.

## Considered Options

- **The Batch API at half price.** Rejected for now. About 140 new SHAB entries a working day pass the Stage Rule, which costs roughly $1 a month on Claude Haiku 5.5 with the criteria prompt cached. Batching would save about 50 cents, delay results by hours and add polling state. Revisit if volume or prices grow.
