---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)["\\\s]+kit[\s\\]+verify\s+acme-sfc'
min: 1
---

The kit is checked again with `kit verify acme-sfc`, which records the new state of the project's files.
