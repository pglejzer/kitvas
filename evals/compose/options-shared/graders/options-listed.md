---
type: regex
target: { source: file, path: '.kitvas/drafts/expenses/v1/src/json/options.json' }
pattern: '^(?=[\s\S]*"options"\s*:\s*\[\s*\{)(?=[\s\S]*table)(?=[\s\S]*card)'
flags: i
match: contains
---

The version's options file holds the option the person asked for, with the table and the cards as its values.
