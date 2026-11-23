---
type: llm
criteria: |
  The package @acme/ui has exactly these components: AcmeProvider, Button (variant solid or ghost, children),
  TextField (label, required) and Badge (tone info or warn, children).
  1. The kit.json the agent wrote lists only components that exist in the package, with only props and values the package's types declare. No invented component, prop or value.
  2. The agent did not write anything under generated/ and did not install a package.
  3. The final answer says what `kit verify` returned in this run, step by step, and does not call a skipped step passed. It names the kit id acme and mentions the studio link or why there is none.
---
