---
type: regex
pattern: '^(?=[\s\S]*\bneutral\b)(?=[\s\S]*\bfix\b)(?=[\s\S]*\breview\b)(?=[\s\S]*\bgood\b)'
flags: i
match: contains
target: last_message
---

The answer lists all four Badge tones: neutral, fix, review, good.
