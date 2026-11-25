---
type: regex
target: { source: file, path: '.kitvas/drafts/bike-rental/before/inventory.json' }
pattern: '^(?=[\s\S]*12 EUR per day)(?=[\s\S]*Book now)(?=[\s\S]*Email)'
match: contains
---

For an image the skill writes the inventory itself: the price, the main button and the field are in it as shown.
