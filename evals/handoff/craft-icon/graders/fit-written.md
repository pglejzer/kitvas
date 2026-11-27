---
type: regex
target: { source: file, path: '.kitvas/drafts/booking-icon/v2/handoff/code/fit.json' }
pattern: '^(?=[\s\S]*"stack"\s*:\s*"[^"]+")(?=[\s\S]*"wiring")(?=[\s\S]*"installs")'
match: contains
---

The fitter's file names the stack it read and has its wiring and installs lists. The picked sketch is
version 2 of the draft.
