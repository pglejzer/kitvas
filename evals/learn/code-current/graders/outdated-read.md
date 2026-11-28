---
type: tool_used
tool: Bash
input_match: '(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)["\\\s]+kit[\s\\]+(?:detect|show\s+acme-sfc)\b'
min: 1
---

The components that are out of date are read from kitvas (`kit detect` or `kit show acme-sfc`), not guessed.
