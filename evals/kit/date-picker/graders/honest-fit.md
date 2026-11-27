---
type: llm
focus: trace
criteria: |
  The project's kit is the built-in kitvas UI kit. For dates it has `DateField`, a date input that uses the
  browser's own date control, and no calendar component. The truth is the output of the kit commands in the
  trace (`kit show`, `kit component <Name>`).
  1. The answer says the kit has `DateField` for dates.
  2. Every prop and value it gives for `DateField` is in the output of `kit component DateField`; it gives
     none that the output does not list.
  3. It claims no calendar, range or blocked-day feature that the output does not show. Saying what the
     kit lacks for a booking screen, and pointing to another way to get it (crafting a calendar, two date
     fields for a range), is fine.
---
