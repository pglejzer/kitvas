---
type: regex
target: { source: file, path: 'src/components/Button.tsx' }
pattern: '^(?![\s\S]*(?:BookingIcon|svg))[\s\S]*export function Button\('
match: contains
---

With scope `new` no existing component is edited to use the icon.
