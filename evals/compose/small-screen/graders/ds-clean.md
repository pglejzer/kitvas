---
type: regex
target: { source: file, path: '.kitvas/drafts/signup/v1/build/json/checks.json' }
pattern: '^(?![\s\S]*"rule"\s*:\s*"ds/(?:raw-control|not-in-catalog|foreign-import|unknown-prop|bad-value)")(?=[\s\S]*"ds"\s*:\s*"ran")'
match: contains
---

The last check ran the design system rules and left no finding of a plain control, of a component or an import
from outside the kit, or of a prop or a value the kit lacks.
