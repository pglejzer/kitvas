---
type: regex
target: { source: file, path: 'app.py' }
pattern: '^(?=[\s\S]*@app\.route\(\s*[\x22\x27]/shop/?[\x22\x27])(?=[\s\S]*render_template\(\s*[\x22\x27]shop\.html[\x22\x27])(?=[\s\S]*@app\.route\(\s*[\x22\x27]/[\x22\x27]\s*\))(?=[\s\S]*render_template\(\s*[\x22\x27]home\.html[\x22\x27])'
match: contains
---

`app.py` is on the person's list, so the route is added there, in the project's own way, and the route of the
home page is still in the file.
