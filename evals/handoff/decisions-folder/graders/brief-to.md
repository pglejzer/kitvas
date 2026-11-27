---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)\\?"?\s+handoff\s+brief\s+shop\b[^|;&]*--to[\s=]+[^a-z]{0,5}src/pages/shop\b'
min: 1
---

The brief takes its folder from the decisions file: `handoff brief shop --to src/pages/shop`.
