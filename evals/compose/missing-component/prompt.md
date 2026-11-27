---
name: compose-missing-component
tags: [smoke]
runs: 3
max_turns: 25
timeout_seconds: 480
allowed_tools: [Skill, Bash, Read, Write, Edit, Agent]
---

Design a "my orders" screen with our kit: a title and three orders, each with its number, a button "Track order" and its status shown as a Badge (Paid, Shipped or Cancelled). Only the filled state. Name the draft "orders". That is the whole brief: do not ask me about the goal, the audience or the content, and I want no options.
