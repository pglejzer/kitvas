---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?=[\s\S]*"type"\s*:\s*"code")(?=[\s\S]*"name"\s*:\s*"Button")(?=[\s\S]*"name"\s*:\s*"Field")(?=[\s\S]*"name"\s*:\s*"Card")(?=[\s\S]*src/components/Button\.vue)(?=[\s\S]*src/components/Card\.vue)(?=[\s\S]*"scoped"\s*:\s*true)(?=[\s\S]*"primary")(?=[\s\S]*"quiet")(?=[\s\S]*"original"\s*:\s*"originals/Button\.1\.html")'
match: contains
---

The kit is a `code` kit with the three components, each pointing at the project's own file, its styles
marked as scoped (the block of the file), the values of Button's variant, and an original for the first
example.
