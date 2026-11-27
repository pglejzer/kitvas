---
type: regex
target: { source: file, path: 'src/components/Card.vue' }
pattern: '^(?![\s\S]*Starter plan)[\s\S]*$'
match: contains
---

The person's own Card component is used, not edited: the draft's text is not written into it.
