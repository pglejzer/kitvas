# 0082. Options of a version: conditions in one source

Date: 2026-11-26. Status: accepted. Changes ADR 0055 in part (the style contexts). Plan 25.

## Context

A person asks for one screen "to choose from": two or three columns, other cards, a light and a dark theme. Each idea was a separate version, and a change made in one never reached the others. The owner wants one version that holds these choices, switched in the editor, while the editing goes on in whichever combination is shown. Hand-off takes one combination; the check must not cost eight times as much without the person knowing.

## Decision

- **Options are conditions in one source.** A version may hold `src/json/options.json`: at most 8 options, each with 2 to 6 values and a default. `kitvas layout` writes an `Options` type and passes `options` to every section beside `state`. The built page's root carries `data-opt-<id>="<value>"` for each option. A value's style is a block `[data-opt-<id>="<value>"] &` nested in the class's rule; a different structure is a branch on the prop. A wholly different layout is its own component file in the section's folder.
- **One build, switching is a re-render.** The default value is the base code; another value is the override. Element ids are the same for every value, so the selection, the locks and the notes survive a switch.
- **The check visits each other value once**, one at a time, at the two main widths. A finding seen only with a value names it. `options/no-effect` marks a value that looks like the default; `options/unknown` marks a `data-opt-` the file does not declare.
- **Hand-off takes the default combination.** The other values stay in the source and are not ported.
- **Options are added or dropped in chat, as a new version.** The editor never edits `options.json`, except that "Make default" writes a `default`.
- **What it changes of ADR 0055.** The style contexts were the width and the state. They get a third dimension, the option. An edit follows the source along options: a value an option sets changes in that option's block only, and everything else changes in the base, so in every option. The width still follows the card.

## Turned down

- **Overlay files per value.** A fix in the base section must be repeated in every overlay, which is the drift the owner ruled out. It needs one build per combination and a frame reload on every switch. Element ids differ per overlay, so a switch loses the selection, locks and notes. Two options that touch one section need a file per pair of values.
- **A full copy of the version per combination.** Three options of two values make eight copies, and every edit is made eight times.
