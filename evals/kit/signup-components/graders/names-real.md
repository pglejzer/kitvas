---
type: regex
pattern: '^(?=[\s\S]*\bInput\b)(?=[\s\S]*\bCheckbox\b)(?=[\s\S]*\bButton\b)'
flags: ''
match: contains
target: last_message
---

The answer names Input, Checkbox and Button, the kitvas UI components for these four elements.
