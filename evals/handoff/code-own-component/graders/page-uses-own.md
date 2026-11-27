---
type: regex
target: { source: file, path: 'src/pages/plans/Plans.vue' }
pattern: '^(?=[\s\S]*(?:AcmeCard|acme-card|\bCard\b))(?=[\s\S]*(?:AcmeField|acme-field|\bField\b))(?=[\s\S]*src/components/(?:Card|Field)\.vue)(?=[\s\S]*Starter plan)'
match: contains
---

The page is written as the project writes its own components: it imports the project's own Card and Field from src/components, and keeps
the draft's text.
