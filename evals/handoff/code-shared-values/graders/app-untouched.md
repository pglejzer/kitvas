---
type: regex
target: { source: file, path: 'src/App.tsx' }
pattern: '^(?![\s\S]*(?:Rentals|rentals))[\s\S]*$'
match: contains
---

With scope `new` the existing `src/App.tsx` is not edited to add a route; the wiring is proposed instead.
