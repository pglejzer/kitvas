---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no browser, so
  `kit verify` runs the steps schema, imports, types and tokens and skips render, look and original.
  1. The answer names Button as the component kitvas listed as out of date because its project file
     changed.
  2. It says that the change was only a comment (or nothing that changes how Button looks or behaves),
     that the kit needed no change for it, and that Button is now recorded as up to date.
  3. It does not claim that Button, Field or Card was converted again or rewritten.
  4. It reports what `kit verify` said: the steps that ran, with their result. It calls none of render,
     look or original passed.
  5. It does not say that kitvas drew or measured any component against the app or against its
     original (nothing could be drawn here); saying that the files were read or compared by hand is
     correct. It does not claim that a package was installed or that the project was built or run.
---
