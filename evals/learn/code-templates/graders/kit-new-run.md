---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)["\\\s]+kit[\s\\]+new\b(?=[^|;&]*?[\s"\\]acme\b)(?=[^|;&]*?--from[\s=\\]+[^a-z]{0,3}code:[^\s|;&]*?\bsrc(?:/app)?/?(?=[\s"\\]|$))'
min: 1
---

The kit skeleton comes from `kit new acme --from code:src/app`, or from `code:src`, the folder above it (a code kit's components name their own files).
