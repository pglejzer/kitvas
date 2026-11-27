---
type: regex
target: { source: file, path: '.kitvas/drafts/rentals/v1/handoff/code/brief.json' }
pattern: '^(?=[\s\S]*"shared")(?=[\s\S]*"setIn"\s*:\s*\[[^\]]*Filters\.tsx")(?=[\s\S]*"readIn"\s*:\s*\[[^\]]*Summary\.tsx")'
match: contains
---

The brief lists the shared value `range` with the file that sets it (Filters) and a file that reads it (Summary).
