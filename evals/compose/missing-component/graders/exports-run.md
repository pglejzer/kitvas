---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)["\\\s]+kit[\s\\]+exports\b'
min: 1
---

When the screen needs a component the project's kit lacks, the skill asks the package what it offers with
`kit exports`.
