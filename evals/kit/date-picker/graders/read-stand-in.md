---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)\\?"?\s+kit\s+component\s+\\?"?(?:Input|Select)\b|for\s+\w+\s+in\s+[^;]*\b(?:Input|Select)\b[^;]*;\s*do\b[^|&]*?kit\s+component\s+\\?"?\$'
min: 1
---

Before it offers a stand-in for the missing date picker, the skill reads the nearest component: Input or Select.
