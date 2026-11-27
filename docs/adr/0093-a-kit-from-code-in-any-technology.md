# 0093. A kit from a project's code in any technology, compared with its drawn original

Date: 2026-11-27. Status: accepted. Changes in part `0035-written-kits.md`. Spec: `docs/specs/2026-11-27-kitvas-any-code-input-design.md`, part "Stage 1". Evidence: `docs/spikes/13-drawn-original.md`.

## Context

kitvas builds and shows React. A repo kit (ADR 0030) points at React components kitvas can bundle; a written kit (ADR 0035) is written by an agent from a Figma file, a website or screenshots. A project whose components are written in another technology had no way in: a repo kit cannot bundle them, and a written kit needs pictures the person may not have. The premise of the project is that the code is enough: an agent reads any code.

An agent that reads a component and writes it again makes mistakes that no one sees: a padding read from the wrong rule, a colour from a variable it did not follow. A copy that is only read cannot be called exact.

## Decision

- **A fourth written-kit source, `code`** (`kit new <id> --from code:<folder>`). The `tailor` agent writes each component again in React into the kit folder, as ADR 0035 says, with the project's own names and values, and records where it came from (`project`: its files, or the library it wraps, its style files and whether they reach only their own component).
- **The agent also writes the original**: for each example, the component's own markup as the project's code draws it (`originals/<Name>.<n>.html`), a plain fragment with nothing that runs and no outside address. The root of every kit component in it carries a mark.
- **kitvas draws the original itself.** It compiles the project's real style files (plain CSS, Sass, style blocks inside component files) with the compiler it has, puts the fragment on a page inside the app's shell the kit declares (`source.shell`: the attributes of `<html>` and `<body>` and the elements around a component), and scopes a component's own styles to its mark with `@scope`. Nothing of the project is built or run.
- **Both pages are measured by one function** (`measure`): the layer walk at rest and with each control under a real pointer, pressed and with keyboard focus, the outlines, and a picture. The step `original` of `kit verify` compares the two walks value by value (a box within 0.5 px, every other value exact) and then the pictures (line 100). It is advice, as `look` is: it never blocks a draft.
- **Three levels, shown per component**: `app` (compared with the running app or pictures of it, by `look`), `code` (compared with the drawn original), `read` (not compared, with the reason). A style the browser cannot read without the project's own build makes the component `read`, never compared against a wrong original.
- **Out of date by hash**: `origins.json` in the kit folder keeps, per component, a hash of its project files and of its copy. `kit detect` and `kit show` name a component whose project files changed; the learn skill converts only those again.

## Turned down

- **Building the original with the project's own tools.** It would be the real thing, but it runs the project's code and its build in Node (against ADR 0032), needs the project's packages installed and working, and needs a reader for every build tool. A project that does not build today could not be learned.
- **Showing drafts in the project's own technology.** Every part of the studio that touches a draft (the mount, the bundle, element ids, the checks, the editor's write-back) would need a second implementation per technology. kitvas stays React; the hand-off writes the project's technology.
- **A table of technologies** (how each one writes a loop, a slot, a binding) in the code or the rules. It is out of date the day it is written and never complete. The rules say what a component does, and the agent reads the code.
- **Trusting the copy as read.** The same agent writes the copy and reads the source, so its mistakes agree with themselves. Only a measured comparison finds them.
- **Counting kept style rules to find what the browser dropped.** Nested rules and at-rules make the counts differ for sound CSS (spike 13). The page is asked what it reads instead.

## Consequences

A person gets a kit of their own components from code alone, each one labelled by how it was checked. The copy must carry every value itself, because it is drawn without the app's shell: a value a component inherits in the app is written in the copy's own styles.

The comparison with the code checks the styles and sizes the agent wrote, not whether it read the template right: the same agent writes the original's markup. Only a comparison with the running app, a screenshot or a Figma file finds that, which is why the skill recommends giving one and the levels are three.

Known limits: styles written in a language kitvas does not compile, or that need the project's build, leave the component `read`; a scoped rule gets no extra weight, so a tie with a project-wide rule may fall the other way than in the app; the walk reads no pseudo-element, only the picture sees one; an original is drawn in the app's default theme only.
