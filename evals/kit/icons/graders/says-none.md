---
type: llm
focus: trace
criteria: |
  The truth is the output of `kit component Icon` in the trace: the kit's icons are the values of its `name`
  prop.
  1. The final answer lists the kit's icons, and no name that the output does not list.
  2. It says that the kit has no icon for delete. Pointing to the nearest icon the kit has as a stand-in is
     fine when the answer says it is not a delete icon; so is pointing to another way to get one (crafting
     an icon).
---
