---
type: regex
pattern: '--kit-(?:spacing|space-(?:4xl|xxl|xxs|2xs|xs|sm|md|lg|xl|2xl|3xl|base|small|medium|large|none|(?!(?:2|4|6|8|10|12|14|16|24|32|48|64|96)\b)[0-9]+\b))'
flags: i
match: not_contains
target: last_message
---

No spacing token outside the thirteen numbered ones (2, 4, 6, 8, 10, 12, 14, 16, 24, 32, 48, 64 and 96) is
named.
