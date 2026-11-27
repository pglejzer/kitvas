---
type: regex
target: { source: file, path: '.kitvas/drafts/plans/v1/handoff/code/brief.json' }
pattern: '^(?=[\s\S]*src/components/Card\.vue#AcmeCard)(?=[\s\S]*src/components/Field\.vue#AcmeField)'
match: contains
---

The brief points each kit component at the person's own file and name, so the fitter looks there first.
