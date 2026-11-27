---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)["\\\s]+kit[\s\\]+component\s+\\?"?DateField\b|for\s+\w+\s+in\s+[^;]*\bDateField\b[^;]*;\s*do\b[^|&]*?kit\s+component\s+\\?"?\$'
min: 1
---

Before it says what `DateField` can do, the skill reads it with `kit component`.
