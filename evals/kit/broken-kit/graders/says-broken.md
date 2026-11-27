---
type: llm
focus: trace
criteria: |
  The kit shopkit is not valid: in the trace `kit check` (or another kit command) answers KIT_INVALID and
  lists what is wrong with it.
  1. The final answer says that the kit shopkit is not valid.
  2. It gives the problems the command printed (what the kit's file lacks or has wrong).
  3. It does not say that the kit was repaired.
---
