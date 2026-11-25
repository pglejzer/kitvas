---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?=[\s\S]*"name"\s*:\s*"Button")(?=[\s\S]*"name"\s*:\s*"TextField")(?=[\s\S]*"solid")'
match: contains
---

The components the kit already had are still in it.
