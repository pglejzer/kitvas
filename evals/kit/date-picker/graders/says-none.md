---
type: regex
pattern: '(no|not|doesn.t|does not|isn.t|without|lacks?|missing)[^.\n]{0,60}(date|picker|calendar)|(date|picker|calendar)[^.\n]{0,60}(not (in|part|available|included)|missing|none|absent|isn.t|doesn.t|does not)'
flags: i
match: contains
target: last_message
---

The answer says plainly that the kit has no date picker.
