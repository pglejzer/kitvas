---
type: regex
target: { source: file, path: '.kitvas/drafts/shop/v1/handoff/code/fit.json' }
pattern: '^(?=[\s\S]*"stack"\s*:\s*"[^"]*(?:Flask|Jinja))(?=[\s\S]*"wiring")(?=[\s\S]*"installs")'
flags: i
match: contains
---

The fitter's file names the stack it read, a Flask project with Jinja templates, and has its wiring and installs
lists.
