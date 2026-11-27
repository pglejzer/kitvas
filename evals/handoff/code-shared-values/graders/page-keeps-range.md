---
type: regex
target: { source: file, path: 'src/pages/rentals/Rentals.tsx' }
pattern: '^(?=[\s\S]*\b(?:useState|useReducer|useSearchParams)\b)(?![\s\S]*\bsetShared\b)(?![\s\S]*shared\.json)'
match: contains
---

The page keeps the range as its own state, the project's way, and does not port the draft's `setShared` or `shared.json`.
