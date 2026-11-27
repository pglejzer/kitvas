---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no browser, so
  `kit verify` runs the steps schema, imports and types and skips render, tokens, look and original.
  1. The answer names Button as the component kitvas listed as out of date because its project file
     changed.
  2. It says that the change was only a comment (or nothing that changes how Button looks or behaves),
     that the kit needed no change for it, and that Button is now recorded as up to date.
  3. It does not claim that Button, Field or Card was converted again or rewritten.
  4. It reports what `kit verify` said: the steps that ran, with their result. It calls none of render,
     tokens, look or original passed.
  5. It does not say that any component was compared with the app or with the code (nothing could be
     drawn here), and does not claim that a package was installed or that the project was built or run.
---
