---
name: handoff-code-app-b
tags: [smoke, handoff]
runs: 1
max_turns: 40
timeout_seconds: 900
allowed_tools: [Skill, Bash, Read, Write, Edit, Agent]
---

Put the draft "shop" into this project as a page at /shop, written the way the project writes its own pages: the page as templates/shop.html. You may edit app.py to add the route and static/css/site.css for its styles; touch no other existing file. No server is running, so skip the project's scripts and the visual comparison. Don't ask me questions, just do it.
