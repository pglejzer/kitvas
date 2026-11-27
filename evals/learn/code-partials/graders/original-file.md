---
type: regex
target: { source: file, path: '.kitvas/kits/acme/originals/Button.1.html' }
pattern: '^(?![\s\S]*<(?:script|style|link|html|body)\b)(?![\s\S]*\bon[a-z]+\s*=)(?=[\s\S]*data-kv-scope="Button")(?=[\s\S]*<button\b)'
match: contains
---

The original of Button's first example is the template's own markup: a `button` carrying the scope mark, with
no script, style, link or event attribute.
