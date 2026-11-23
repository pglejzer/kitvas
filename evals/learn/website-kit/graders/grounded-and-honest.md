---
type: llm
criteria: |
  The site is a small fixture page with a button, a text field, a card and a heading, served at http://127.0.0.1:4173/.
  1. The components the tailor wrote correspond to elements the scan found. No component for something the page does not show, and no prop or state the facts and crops do not support.
  2. Component styles use var(--kit-*) tokens only, no hex colours, and no font file, image or logo was copied into the kit.
  3. The final answer says what `kit verify` returned in this run, step by step. It does not call a skipped step passed (`tokens` is skipped for a written kit; `render` and `look` are skipped without a browser). It gives the look score of each example that has one, or says none was available, and it names examples without a reference.
---
