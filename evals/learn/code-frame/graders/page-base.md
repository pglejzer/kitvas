---
type: regex
target: { source: file, path: '.kitvas/kits/acme/styles/page.css' }
pattern: '^(?![\s\S]*\.[a-z][\w-]*\s*\{)(?=[\s\S]*\bbody\s*\{)(?=[\s\S]*var\(--kit-)'
match: contains
---

The page a draft stands on is the kit's `styles/page.css` (rule W9a): the app's `body` rule with its values
through tokens, and no class.
