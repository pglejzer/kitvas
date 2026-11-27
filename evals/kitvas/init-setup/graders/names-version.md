---
type: regex
pattern: '\b\d+\.\d+\.\d+\b'
match: contains
target: last_message
---

The answer includes a version number. Which one is not written here, so a release does not break this grader:
`answer-complete` holds it to what `status` printed.
