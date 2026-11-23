---
type: regex
pattern: 'states\.json[\s\S]*empty|empty[\s\S]*states\.json'
flags: i
match: contains
target: trace
---

`states.json` was written with an `empty` state (checked loosely in the trace; the llm grader checks the content).
