---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no browser and no
  dev server, and the person asked to skip the project's scripts.
  1. The answer lists the files that were written, under src/pages/shop.
  2. It says what the written page uses of the project: the stack as it was read, and which of the draft's
     components and tokens became the project's own (or plain markup), as a short mapping.
  3. It says the look was not compared (no address was given) and that the project's scripts were not run. It
     does not say the result builds, passes the type check or matches the draft.
  4. It does not claim that an existing file was edited, that a package was installed, or that anything was
     committed. Wiring the page in (a route) is proposed, not done.
---
