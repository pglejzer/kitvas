---
type: regex
target: { source: file, path: 'src/components/BookingIcon.tsx' }
pattern: '^(?=[\s\S]*<svg)(?=[\s\S]*viewBox)(?=[\s\S]*export\s+(?:default\s+)?(?:function|const)\s+BookingIcon\b)(?![\s\S]*(?:@kit|--kit-))'
match: contains
---

The icon is a component of the project's own under the name the person gave: an SVG, exported as
BookingIcon, with nothing imported from the kit and no kit token.
