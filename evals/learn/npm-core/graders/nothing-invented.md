---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?![\s\S]*"name"\s*:\s*"(?!(?:AcmeProvider|Button|TextField|Badge|theme|children|variant|className|label|placeholder|tone|react|react-dom|[^"]*acme[^"]*|[^"]*\s[^"]*)")[^"]*")[\s\S]*"components"'
flags: i
match: contains
---

Every name in the kit is one the package has: its four components, their seven props, the packages and the
kit's own name (the only one with "acme" or a space in it).
