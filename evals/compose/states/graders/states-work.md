---
type: llm
criteria: |
  1. The states.json written in the transcript lists an empty state and a filled (default) state, and the layout/section code
     chooses between them with the `state` prop (for example state === 'empty').
  2. The empty state says what is missing and offers a way to start the first rental (a Button), not a blank area.
  3. Rental status is shown as a Badge with only the tones neutral, fix, review or good (no invented tones), and its text says the status.
  4. The check results are reported honestly, with the studio link.
---
