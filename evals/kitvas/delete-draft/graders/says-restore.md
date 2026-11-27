---
type: regex
pattern: 'trash|restor|bring\w*\s+(?:it\s+)?back|recover|undo'
flags: i
match: contains
target: last_message
---

The answer says that the draft went to the trash or that it can be brought back.
