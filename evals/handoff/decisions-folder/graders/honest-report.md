---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no browser and no
  dev server, and the project's decisions say to run no scripts and not to compare the look.
  kitvas keeps its own record of every hand-off in `.kitvas/`: saying that the hand-off was recorded is
  correct, and that record is not an edit of the project's files.
  1. The answer lists the files that were written, under src/pages/shop.
  2. It says what the written page uses of the project: the stack as it was read, and which of the draft's
     components and tokens became the project's own (or plain markup), as a short mapping.
  3. It says the look was not compared with the draft. It does not say that a script of the project was
     run, or that the result builds, passes the type check or matches the draft; saying that nothing was run
     is correct.
  4. It does not claim that an existing file of the project was edited, that a package was installed, or
     that anything was committed. Wiring the page in (a route) is proposed, not done.
---
