---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)["\\\s]+kit[\s\\]+(?:new|use)\b'
min: 0
max: 0
---

A question about a kit that does not exist creates no kit and changes none.
