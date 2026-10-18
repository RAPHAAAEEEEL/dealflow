# Haiku-only pipeline under a hard monthly cap

API spend is capped at about €10 a month, and the cap is enforced in code: a run stops rather than overspends. The unattended pipeline uses only Claude Haiku, through the Batch API where possible, for Screening. Heavier work happens in Claude Code sessions on the Owner's subscription, usually around Triage: Memo drafts, deep research, the Backtest and, later, call transcripts. That is why the pipeline does not write Memos itself.
