---
type: llm
criteria: |
  The package @acme/ui has a Badge component with a tone prop (info or warn) and children.
  1. The kit.json of the acme kit now holds a Badge component with tone as an enum of exactly info and warn (not more), and children as a required node. Its import is from the package @acme/ui.
  2. The other components of the kit are still there; nothing else was removed.
  3. Badge is no longer listed in gaps as missing.
  4. Nothing was written under generated/, and no package was installed.
  5. The final answer says what `kit verify` returned in this run and does not call a skipped step passed.
---
