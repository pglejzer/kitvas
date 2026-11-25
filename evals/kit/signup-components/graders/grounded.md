---
type: llm
focus: trace
criteria: |
  The answer maps the email and password fields to Input (using its type prop, e.g. email and password),
  the terms checkbox to Checkbox and the submit to Button (type submit). Every component, prop and value
  it mentions appears in the output of the kit commands in the trace (`kit show`, `kit component <Name>`),
  under a component's props or styling. If it points out that the kit has no dedicated form or password
  component, that is correct, not a failure. Plain HTML around the kit components (a form element and its
  onSubmit) is not a kit prop. Naming another kit component without its props, or saying its props were
  not read, is fine.
---
