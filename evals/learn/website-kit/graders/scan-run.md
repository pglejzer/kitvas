---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)\\?"?\s+kit\s+scan\s+site'
min: 1
---

The page is read with `kit scan site`, and `--allow-private` appears because the user said the server is their own.
