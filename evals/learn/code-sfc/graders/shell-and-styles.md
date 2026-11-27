---
type: regex
target: { source: file, path: '.kitvas/kits/acme/kit.json' }
pattern: '^(?=[\s\S]*"styles"\s*:\s*\[[^\]]*src/styles/app\.css)(?=[\s\S]*"shell"\s*:\s*\{)(?=[\s\S]*"data-theme"\s*:\s*"light")(?=[\s\S]*"id"\s*:\s*"app")'
match: contains
---

The kit says what the app has around every component: the shared style file in `source.styles`, and in
`source.shell` the theme attribute of the page and the root element the components inherit their font and
colour from. Without them an original is drawn in the browser's own font and the copy is held against it.
