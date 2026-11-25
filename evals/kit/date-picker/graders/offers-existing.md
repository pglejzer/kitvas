---
type: llm
focus: trace
criteria: |
  The answer says the kit has no date picker and points to at least one component that is in the kit as a
  stand-in (for example Input or Select), or says plainly that nothing in the kit can stand in. The truth is
  the output of the kit commands in the trace (`kit show`, `kit component <Name>`): every prop and value the
  answer gives for a component is in that output, and it gives no date type or date value that the output
  does not list. Naming a component without its props, or saying its props were not read, is fine. Pointing
  to another way to get a date picker (crafting one, learning another design system) is fine.
---
