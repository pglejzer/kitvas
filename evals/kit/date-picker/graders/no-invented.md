---
type: regex
pattern: '<\s*(DatePicker|Calendar|DateInput|DateField|TimePicker)\b|import\s*\{[^}]*(DatePicker|Calendar|DateInput|DateField)[^}]*\}\s*from'
flags: ''
match: not_contains
target: last_message
---

No date component may be used in code or imports as if it existed.
