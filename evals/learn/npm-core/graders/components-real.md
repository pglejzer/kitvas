---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?=[\s\S]*"name"\s*:\s*"Button")(?=[\s\S]*"name"\s*:\s*"TextField")(?=[\s\S]*"name"\s*:\s*"Badge")(?=[\s\S]*"solid")(?=[\s\S]*"ghost")(?=[\s\S]*"info")(?=[\s\S]*"warn")'
match: contains
---

The kit lists the three components of the package with the values their types declare.
