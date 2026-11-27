---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)["\\\s]+kit[\s\\]+component\s+\\?"?Icon\b'
min: 1
---

`kit show` gives only how many icons the kit has; their names are the values of `name` in `kit component Icon`.
