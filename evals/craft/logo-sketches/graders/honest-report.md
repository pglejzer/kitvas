---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no browser, so of the
  checks only build, types and ds can run; a11y, ui, ux and runtime are skipped.
  1. The answer says what each of the three sketches A, B and C is: one idea each, and the three ideas differ.
  2. For each sketch it names the nearest known mark or stock pictogram and what sets the sketch apart, or says
     that none is known.
  3. It calls none of a11y, ui, ux or runtime passed. Saying that some checks were skipped because no browser
     was found is correct, not a failure.
  4. It asks the person to pick, and does not claim that a sketch was picked or added to the kit.
---
