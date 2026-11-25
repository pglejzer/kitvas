---
type: regex
target: { source: file, path: '.kitvas/drafts/bike-rental/v1/build/js/index.js' }
pattern: '^(?=[\s\S]*12 EUR)(?=[\s\S]*Book now)(?=[\s\S]*Northwind Bikes)'
match: contains
---

The built page still holds the original's price, main button and brand name.
