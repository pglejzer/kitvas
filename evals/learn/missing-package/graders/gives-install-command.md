---
type: regex
pattern: '(npm|pnpm|yarn)\s+(install|add|i)\s+@acme/ui'
flags: i
match: contains
target: last_message
---

The final answer gives the install command for the person to run.
