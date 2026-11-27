---
type: regex
pattern: '--kit-(?:spacing|space-(?:4xl|xxl|xxs|2xs|base|small|medium|large|[0-9]+\b))'
flags: i
match: not_contains
target: last_message
---

No spacing token outside none, xs, sm, md, lg, xl, 2xl and 3xl is named.
