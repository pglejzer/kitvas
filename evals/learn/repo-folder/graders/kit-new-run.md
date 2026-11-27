---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)["\\\s]+kit[\s\\]+new\s+acme\b[^|;&]*--from[\s=]+[^a-z]{0,3}repo:(?:\./)?src/ds\b'
min: 1
---

The kit skeleton comes from `kit new acme --from repo:src/ds`.
