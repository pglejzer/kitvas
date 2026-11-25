---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)\\?"?\s+status'
min: 1
---

The skill reads the state with `status --json`.
