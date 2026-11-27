---
type: regex
target: { source: file, path: 'templates/shop.html' }
pattern: '^(?=[\s\S]*\{%-?\s*extends\s+[\x22\x27]base\.html[\x22\x27])(?=[\s\S]*City Cruiser)(?=[\s\S]*Rent this bike)(?![\s\S]*(?:className=|<(?:Stack|Heading|Text|Button)\b|@kit|--kit-|import\s))'
match: contains
---

The page is a template of the project: it extends `base.html` as the project's own page does, keeps the draft's
words, and holds nothing of the draft's technology (no JSX, no kit component, no kit token, no import).
