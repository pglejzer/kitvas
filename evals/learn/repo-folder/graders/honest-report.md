---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no browser, so
  `kit verify` runs the steps schema, imports and types and skips render, tokens and look.
  1. The answer says that the design system in the folder src/ds was learned as the kit acme and that acme is
     now the kit of the project.
  2. It reports what `kit verify` said: the steps that ran, with their result. It calls none of render, tokens
     or look passed; saying they were skipped because there is no browser is correct.
  3. It gives the studio link, or says why there is none.
  4. It does not claim that a package was installed.
---
