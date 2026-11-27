---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no browser, so
  `kit verify` runs the steps schema, imports and types and skips render, tokens, look and original.
  1. The answer names Button as the component of the kit that was out of date because its project file
     changed, and says it was converted again.
  2. It says that Field and Card were left as they were, because their project files had not changed.
  3. It reports what `kit verify` said: the steps that ran, with their result. It calls none of render,
     tokens, look or original passed.
  4. It does not say that any component was compared with the app or with the code (nothing could be drawn
     here). Saying that they were only read, or that the comparison was skipped because there is no browser,
     is correct. It may recommend an address of the running app, screenshots or a Figma file.
  5. It does not claim that a package was installed, or that the project was built or run.
---
