---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)["\\\s]+kit[\s\\]+verify\s+acme-sfc\b[^|;&]*--current[\s=]+[^|;&]*\bButton\b'
min: 1
---

Button was looked at against the project as it is now and needed no change, so it is recorded with
`kit verify acme-sfc --current Button`. Without it kitvas would name Button as out of date for ever.
