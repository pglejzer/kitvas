---
type: regex
target: { source: file, path: '.kitvas/drafts/expenses/v1/src/json/shared.json' }
pattern: '^(?=[\s\S]*"values"\s*:\s*\[\s*\{)(?=[\s\S]*"default"\s*:\s*"[^"]+")(?=[\s\S]*month)'
flags: i
match: contains
---

The filter changes other sections, so the period is a shared value of the version, with its default.
