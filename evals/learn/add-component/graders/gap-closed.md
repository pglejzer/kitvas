---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?![\s\S]*"path"\s*:\s*"Badge")[\s\S]*"components"'
match: contains
---

Badge is no longer listed in `gaps`.
