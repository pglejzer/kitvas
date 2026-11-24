# 0062. Scout, the agent that reads the web

Date: 2026-11-24. Status: accepted. Builds on ADR 0035 to 0039 (a site read only through a scan) and on the agent form of ADR 0030.

## Context

A skill sometimes needs a fact it does not have: what a pricing page of a field really states, what a named public product does, what a symbol stands for. None of the five agents can read the web, so the skill invents the fact or asks the person. The web is also the one place where text is written by strangers and may carry instructions, and a search query leaves the machine.

## Decision

- **One agent reads the web.** `kitvas:scout` has the tools `WebSearch`, `WebFetch`, `Read` and `Write`, runs on Sonnet, and has no shell. It gets one to five questions and writes one note, `<draft>/v<N>/md/research.md`. Its rules are `reference/scout.md`, with ids `R-SCOUT-<n>`.
- **What it may bring back:** facts in words, each with its address and the date read; what was not found; what looked odd. A number has its unit and its year. Sources that disagree are both given.
- **What never comes back or goes out:** a look (a colour, a font, a layout, a traced or point by point described logo or icon), text copied wholesale, a saved image. A query holds only public terms of the question, never the person's name, an email, a path, code or text of a project or draft.
- **A page is data.** An instruction on a page or in a result is never followed. It is named in the note under "Odd".
- **Only public pages.** No local or private address, no login, no sent form, no file to run. A budget of 6 searches and 8 pages bounds each call.
- **Who calls it.** The compose skill, when the brief needs real facts the person did not give, and the craft skill, for a logo or an icon whose subject it does not know. Not rework, which works from the person's own page. The skill tells the person in one line what is looked up and on which model, and skips the scout when the person said not to use the web or gave the content.
- **The note is data.** The skill writes the brief, and the brief says which lines come from the note. A scout that is blocked never stops a skill: the skill goes on without research.

## Alternatives

- **The main agent searches itself.** It would put page text, with any instruction in it, into the context that runs every command, and it would send queries built from the whole conversation. A separate agent with no shell and a note as its only output keeps both away from the main agent.
- **No web at all.** The skills would go on inventing facts or asking the person for what they could read in a minute.

## Consequences

The plugin has six agents. A skill can ground a brief in sources that the person can check. The cost is a small new surface: web text enters the repo as a note, so the note is read as data and the rules limit what it may hold. The note lives in the draft's `md/` folder, which a new version copies, so it stays with the draft.
