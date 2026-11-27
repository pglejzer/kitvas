---
type: llm
focus: trace
criteria: |
  The project has no kit called acme: in the trace the kit commands answer KIT_NOT_FOUND for it, and
  `kit list`, when it was run, shows the kits that exist.
  1. The final answer says that there is no kit called acme in this project.
  2. It gives no list of components as the acme kit's own. Naming the kits that do exist with what they
     hold, or offering to learn the person's design system as a kit, is fine.
---
