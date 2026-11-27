---
type: regex
target: { source: file, path: 'templates/base.html' }
pattern: '^(?![\s\S]*(?:shop|Shop))(?=[\s\S]*\{% block content %\}\{% endblock %\})[\s\S]*$'
match: contains
---

`templates/base.html` is not on the person's list: it holds nothing of the new page and still has its one block.
