---
type: regex
target: { source: file, path: '.kitvas/drafts/expenses/v1/build/json/checks.json' }
pattern: '^(?![\s\S]*"rule"\s*:\s*"(?:ux/shared-unused|options/unknown)")(?=[\s\S]*"ds"\s*:\s*"ran")'
match: contains
---

The last check found every shared value set by one section and read by another, and no style block for an option
or a value the version lacks. Both rules read the sources, so they run without a browser.
