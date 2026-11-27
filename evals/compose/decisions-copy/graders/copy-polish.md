---
type: regex
target: { source: file, path: '.kitvas/drafts/newsletter/v1/build/js/index.js' }
pattern: '\\u01[0-7][0-9A-Fa-f]|[ąćęłńśźż]'
match: contains
---

The screen's copy is Polish, as the project's decisions say: the built page holds Polish letters. The bundler
writes a letter outside ASCII as `ł`, and a page with English copy holds no such letter.
