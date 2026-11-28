---
type: regex
target: { source: file, path: '.kitvas/kits/shop/json/css-var-map.json' }
pattern: 'theme\(\s*[A-Za-z][A-Za-z0-9_.-]*\s*\)'
match: contains
---

The tokens map onto theme paths of the project's config (`theme(colors.primary)`), not onto variables Tailwind 3 does not have.
