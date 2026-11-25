---
type: regex
target: { source: file, path: '.kitvas/drafts/rentals/v1/src/json/states.json' }
pattern: '^(?=[\s\S]*"id"\s*:\s*"empty[a-z0-9-]*")(?=[\s\S]*"id"\s*:\s*"filled")'
match: contains
---

`states.json` lists the filled state and an empty one.
