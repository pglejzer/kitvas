---
type: regex
target: { source: file, path: '.kitvas/drafts/shop/v2/src/tsx/sections/Hero.tsx' }
pattern: '^(?=[\s\S]*<Badge\b)(?=[\s\S]*Popular)(?![\s\S]*<Badge\b[^>]*\btone="(?!(?:neutral|fix|review|good)"))'
match: contains
---

The hero section of version 2 holds a Badge and the word "Popular", and no Badge has a tone the kitvas UI kit lacks.
