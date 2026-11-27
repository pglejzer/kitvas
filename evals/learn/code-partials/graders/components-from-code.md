---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?=[\s\S]*"type"\s*:\s*"code")(?=[\s\S]*"name"\s*:\s*"Button")(?=[\s\S]*"name"\s*:\s*"Field")(?=[\s\S]*"name"\s*:\s*"Card")(?=[\s\S]*src/partials/button\.html)(?=[\s\S]*src/partials/card\.html)(?=[\s\S]*src/styles/button\.scss)(?=[\s\S]*"primary")(?=[\s\S]*"quiet")(?=[\s\S]*"original"\s*:\s*"originals/Button\.1\.html")'
match: contains
---

The kit is a `code` kit with the three components, each pointing at the project's own partial and its style
file under src/styles, the values of Button's variant, and an original for the first example.
