---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?=[\s\S]*"name"\s*:\s*"Button")(?=[\s\S]*"name"\s*:\s*"Card")(?=[\s\S]*"name"\s*:\s*"Stack")(?=[\s\S]*"primary")(?=[\s\S]*"quiet")(?=[\s\S]*"tight")(?=[\s\S]*"normal")'
match: contains
---

The kit lists the three components of the folder with the values their types declare: Button's tones primary
and quiet, Stack's gaps tight and normal.
