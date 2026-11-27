---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no browser, so of the
  checks only build, types and ds can run; a11y, ui, ux and runtime are skipped.
  1. The answer gives the studio link.
  2. It states the check results in plain words. It calls none of a11y, ui, ux or runtime passed; saying that
     the checks needing a browser were skipped is correct.
---
