---
name: compose-states
tags: [slow]
runs: 1
max_turns: 80
timeout_seconds: 1500
allowed_tools: [Skill, Bash, Read, Write, Edit, Agent]
---

Design a one-page "my bike rentals" screen: a title and a list of the customer's rentals, each with the bike name, the dates and a status label (active, returned or overdue). It must also show what the screen looks like when the customer has no rentals yet (with a way to start the first one) and a filled list of three rentals. Set up kitvas here if it is not set up yet. Don't ask me questions: use sensible defaults and just build it.
