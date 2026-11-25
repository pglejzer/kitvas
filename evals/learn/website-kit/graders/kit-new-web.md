---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)\\?"?\s+kit\s+new\s+site\b[^|;&]*--from[\s=]+[^a-z]{0,3}web:http://127\.0\.0\.1:4173'
min: 1
---

The kit is created from the website with `kit new site --from web:…`.
