---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no browser, so
  `kit verify` runs the steps schema, imports, types and tokens and skips render, look and original.
  1. The answer names Button as the component of the kit that was out of date because its project file
     changed, and says what was changed in the kit for it (its copy, or a token it uses).
  2. It says that Field and Card keep their look, because their project files had not changed. A change
     made so that they keep it (for example a token of their own when Button's colour changed) is correct.
  3. It reports what `kit verify` said: the steps that ran, with their result. It calls none of render,
     look or original passed.
  4. It does not say that kitvas drew or measured any component against the app or against its original
     (nothing could be drawn here). Saying that they were only read, compared by hand, or that the
     comparison was skipped because there is no browser, is correct. It may recommend an address of the
     running app, screenshots or a Figma file.
  5. It does not claim that a package was installed, or that the project was built or run.
---
