---
type: regex
target: { source: file, path: '.kitvas/decisions.md' }
pattern: '^(?![\s\S]*(?:copy:\s*de\b|German))[\s\S]*kit:\s*kitvas-ui'
match: contains
---

The decisions file still names only the kit: no copy language and no line about German was written into it.
