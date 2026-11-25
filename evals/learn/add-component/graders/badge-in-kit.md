---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?=[\s\S]*"name"\s*:\s*"Badge")(?=[\s\S]*"values"\s*:\s*\[\s*"(?:info"\s*,\s*"warn|warn"\s*,\s*"info)"\s*\])(?=[\s\S]*"from"\s*:\s*"@acme/ui")'
match: contains
---

The kit holds Badge, with a tone of exactly info and warn, imported from the package.
