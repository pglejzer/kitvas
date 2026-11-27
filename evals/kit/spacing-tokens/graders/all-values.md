---
type: regex
pattern: '^(?=[\s\S]*--kit-space-)(?=[\s\S]*\b2px)(?=[\s\S]*\b4px)(?=[\s\S]*\b6px)(?=[\s\S]*\b8px)(?=[\s\S]*\b10px)(?=[\s\S]*\b12px)(?=[\s\S]*\b14px)(?=[\s\S]*\b16px)(?=[\s\S]*\b24px)(?=[\s\S]*\b32px)(?=[\s\S]*\b48px)(?=[\s\S]*\b64px)(?=[\s\S]*\b96px)'
match: contains
target: last_message
---

The answer gives the spacing tokens of the kitvas UI kit with their values: 2, 4, 6, 8, 10, 12, 14, 16, 24,
32, 48, 64 and 96 px (thirteen tokens, named `--kit-space-` and the number).
