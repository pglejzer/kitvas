---
type: regex
pattern: '<\s*(DatePicker|Calendar|DateInput|DateRangePicker|TimePicker)\b|import\s*\{[^}]*(DatePicker|Calendar|DateInput|DateRangePicker|TimePicker)[^}]*\}\s*from'
flags: ''
match: not_contains
target: last_message
---

No date component the kit lacks may be used in code or imports as if it existed; the kit's own `DateField` may.
