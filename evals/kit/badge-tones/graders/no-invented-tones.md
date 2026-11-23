---
type: regex
pattern: '\btone="?(success|warning|error|danger|info|primary|secondary|critical)\b'
flags: i
match: not_contains
target: last_message
---

No tone outside neutral, fix, review and good may be presented as a Badge value.
