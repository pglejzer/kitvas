---
type: llm
criteria: |
  The project already has a kit called acme, learned from the package @acme/ui: `kit new acme` answers
  KIT_EXISTS, and the kit commands show the kit.
  1. The final answer says that a kit called acme already exists.
  2. It asks for another id for a new kit, or offers to add components to the kit that exists.
  3. It does not say that a kit was learned in this run.
---
