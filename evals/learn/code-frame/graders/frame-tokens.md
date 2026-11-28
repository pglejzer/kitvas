---
type: regex
target: { source: file, path: '.kitvas/kits/acme/json/tokens.json' }
pattern: '"value"\s*:\s*(?:720|1140)\b'
match: contains
---

The container's widths are tokens (rule W42a): 720 or 1140 px, as the app's shared styles give them.
