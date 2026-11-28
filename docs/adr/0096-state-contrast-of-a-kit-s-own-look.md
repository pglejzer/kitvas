# 0096. State contrast of a kit's own look is for review

Date: 2026-11-28. Status: accepted. Changes in part `0085-controls-under-the-pointer-and-in-use.md`.

## Context

ADR 0085 kept `a11y/state-contrast` at `fix` inside a kit component (`kit: 'keep'`), because the draft's own style on a kit control was the usual cause: a draft's "on" background that the kit's hover rule replaced. A kit learned from an app's code copies the app's hover and focus looks one to one, and `kit verify` holds them to the app. Two drafts on such kits (a profile page and an article page) kept five and six `fix` findings that the draft could not fix: the app's own favourite and follow buttons turn white on green and grey under the pointer, and the drafts gave those components no class and no style. The patcher's only way out was to restyle the kit component, which breaks the copy the kit was verified against.

## Decision

- **`fix` when the draft styles it.** The finding stays `fix` when the draft passed `className` or `style` to the kit component that holds the control, or to a kit component around it: the usage records of the page say which props each instance got.
- **`review` otherwise**, with the `checkHint.kitInternal` hint, like every other finding caused by a kit component's own markup: the state's look is the kit's, to be raised with the kit's owners, not restyled in a draft.
- A control the draft draws itself (no kit component) stays `fix`, as before.

## Turned down

- **`fix` everywhere (0085 as it was).** A draft on a faithful kit of a real app can never be clean, and the patcher is pushed to break the kit's look.
- **`review` everywhere inside a kit component.** The case 0085 was written for, a draft's own style undone by the kit's hover rule, would go unfixed.
- **Reading the draft's style sheets for rules that reach the control.** The compose rules already forbid styling a kit component's inner elements from a section; a class or a style passed to the component is how a draft styles it.

## Consequences

A draft from a learned kit reports the app's own hover and focus contrast as something to review, and the patcher leaves it alone. A draft that styles a kit control still has to keep its states readable.
