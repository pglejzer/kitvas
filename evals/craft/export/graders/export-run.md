---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)\\?"?\s+craft\s+export\s+\\?"?booking-icon\b[^|;&]*--to[\s=]+[^a-z]{0,5}exports\b'
min: 1
---

The file is written by `craft export booking-icon --to exports`, not by hand.
