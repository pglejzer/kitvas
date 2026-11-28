---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?=[\s\S]*"type"\s*:\s*"code")(?=[\s\S]*"name"\s*:\s*"Container")(?=[\s\S]*"category"\s*:\s*"layout")(?=[\s\S]*"name"\s*:\s*"(?:Row|Col|Column|Grid)")(?=[\s\S]*"name"\s*:\s*"Badge")(?=[\s\S]*"name"\s*:\s*"Notice")'
match: contains
---

The kit holds the frame the pages stand on (rule W42a): a `Container` and a row or column component in the
category `layout`, beside the two components of the project.
