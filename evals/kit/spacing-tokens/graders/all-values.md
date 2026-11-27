---
type: regex
pattern: '^(?=[\s\S]*--kit-space-)(?=[\s\S]*\b4px)(?=[\s\S]*\b8px)(?=[\s\S]*\b12px)(?=[\s\S]*\b16px)(?=[\s\S]*\b24px)(?=[\s\S]*\b32px)(?=[\s\S]*\b48px)'
match: contains
target: last_message
---

The answer gives the spacing tokens of the Base kit with their values: 4, 8, 12, 16, 24, 32 and 48 px (the
eighth, `none`, is 0).
