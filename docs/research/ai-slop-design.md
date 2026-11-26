# AI slop in design: rules for kitvas

These rules are binding for the kitvas editor and studio redesign, and for every new draft kitvas generates (screens, pages, components, icons, logos). "AI slop" here means the generic, templated look that AI-generated and low-effort interfaces share. Research shows it comes from unmodified defaults and the statistical average of the web, not from one tool ([Adrian Krebs, design slop, via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic)). The studio is a dense professional tool, so it must not look like a generated landing page. A draft must look like the project's own kit, not like the average of the web. Every "Instead:" line stays inside the kit: use the kit's components and `--kit-*` tokens (the studio uses the built-in kit's neutral greys and one accent). No rule invents a palette, font or brand look. A reviewer may fail a screen on any rule below.

## Contents

1. [Colour](#1-colour)
2. [Surfaces](#2-surfaces)
3. [Typography](#3-typography)
4. [Layout](#4-layout)
5. [Icons and illustration](#5-icons-and-illustration)
6. [Motion](#6-motion)
7. [AI features](#7-ai-features)
8. [Copy and states](#8-copy-and-states)
9. [Process smells](#9-process-smells)
- [For generated drafts](#for-generated-drafts)
- [Review checklist](#review-checklist)
- [Sources](#sources)

Notes on the evidence. Most sources are practitioner blogs, not studies. Tell-lists show that a pattern is common, not that it proves AI made the screen. Krebs found 33% of sites had one or fewer of 15 patterns and says the real fault is "shipping LLM defaults", not the use of AI ([Krebs, via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop)). Where sources disagree, the rule says so.

---

## 1. Colour

### 1.1 Default indigo / violet accent
- Avoid: a purple, indigo or violet primary button or link, especially the Tailwind `indigo-500/600` look.
- Instead: the kit's single accent token for primary action; nothing else gets the accent.
- Why: indigo became the "modern button" in training data after years of Tailwind demos, so it reads as untouched defaults.
- Sources: [Why every AI built website looks the same (DEV)](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p); [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Anthropic cookbook: frontend aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics).

### 1.2 Gradients and gradient text
- Avoid: gradient fills on buttons, headings, borders or backgrounds; purple-to-blue gradients; gradient text.
- Instead: flat kit surface and text tokens. Hierarchy comes from size, weight and the neutral ramp.
- Why: "gradients on everything" is the most common single tell (28% of 500 Show HN sites).
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Adrian Krebs, design slop](https://adriankrebs.ch/blog/design-slop/); [Fix the AI-generated look (DEV)](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh).
- Disagreement: Anthropic's prompt advises "layered gradients" for atmosphere, and IBM Carbon uses glow and gradient to mark AI content. Both target marketing pages or a closed design system with its own AI tokens. kitvas has no such tokens, so the ban stands. See 7.2.

### 1.3 Neon glow and coloured shadows
- Avoid: glowing borders, large coloured glows, coloured box-shadows, "aurora" backdrops.
- Instead: the kit's shadow and border tokens, in neutral tone.
- Why: glow reads as decoration and lowers contrast; it is listed among the standard AI tells.
- Sources: [Krebs: design slop](https://adriankrebs.ch/blog/design-slop/); [Blode: you don't have to make AI slop](https://blode.co/writing/you-dont-have-to-make-ai-slop); [Why AI standardises start-up identity](https://www.startupbusiness.it/en/why-ai-standardises-the-visual-identity-of-start-ups-and-how-to-avoid-it/177662/).

### 1.4 Low-contrast grey-on-grey
- Avoid: mid-grey text on a grey or tinted surface; dark mode with dim grey body text; disabled-looking labels that carry real information.
- Instead: kit text tokens that pass WCAG contrast on their surface. De-emphasise with size and position first, colour second.
- Why: low-contrast body text in dark themes is a named slop pattern, and it fails accessibility.
- Sources: [Krebs: design slop](https://adriankrebs.ch/blog/design-slop/); [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui); [Refactoring UI](https://www.refactoringui.com/).

### 1.5 More than one accent colour
- Avoid: several hues competing (a blue button, a green badge, an orange tag, a purple chip) with no meaning behind them.
- Instead: one accent for action and selection. Status colours (error, warning, success) only for status, from kit tokens.
- Why: Linear cut colour chrome to get "a more neutral and timeless appearance"; decorative colour pulls attention the user has not earned.
- Sources: [Linear: behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh); [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui); [Superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic).

### 1.6 Colour as decoration on boxes
- Avoid: a coloured stripe on a card's left or top edge; coloured icon backgrounds per item; tinted header bands.
- Instead: neutral surface; put colour only where state needs it.
- Why: the coloured card stripe is a listed tell (13%); Linear removed coloured team-icon backgrounds.
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Linear: behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh); [Robots on Payroll: avoid that vibe coded look](https://robotsonpayroll.substack.com/p/how-to-avoid-that-vibe-coded-look).

**How to check:** Count distinct hues on screen outside the canvas content. More than one accent plus status colours fails. Search styles for `gradient`, `glow`, hex values and `indigo/violet/purple`: any hit fails. Squint test: if body text blurs into its background, it fails.

---

## 2. Surfaces

### 2.1 Glassmorphism and blur
- Avoid: translucent blurred panels, frosted toolbars, `backdrop-filter` on panels.
- Instead: opaque kit surface tokens. Use blur only where a layer truly floats over moving content, and only if the kit defines it.
- Why: blur lowers text contrast, costs paint time, and 17% of sites show it as a tell. Critics call it a decade-old effect revived by marketing.
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Glassmorphism: the most beautiful trap (search summary only; page not readable)](#sources-not-read); [Bento Box Sprawl and related smells (AI Smells)](https://aismells.pages.dev/bento-box-sprawl.html).
- Disagreement: defenders say glass gives depth and focus. In a dense editor the depth is not needed.

### 2.2 Cards inside cards
- Avoid: a bordered, shadowed card that contains another bordered, shadowed card.
- Instead: one container level. Group inside it with spacing, a divider token or a heading.
- Why: nested boxes add noise without information; "structure should be felt, not seen".
- Sources: [Linear: behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh); [Refactoring UI](https://www.refactoringui.com/); [Figma: designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/).

### 2.3 Heavy or inconsistent drop shadows
- Avoid: large soft shadows on every card; shadows pointing in different directions; vibrant coloured shadows.
- Instead: the kit's elevation tokens only, on things that actually float (menus, popovers, dialogs). Flat panels get none.
- Why: Josh Comeau's rule is one light source and consistent offsets; soft grey shadows on floating cards are a vibe-coded tell.
- Sources: [Josh Comeau: designing beautiful shadows](https://www.joshwcomeau.com/css/designing-shadows/); [MindStudio: avoid vibecoded landing pages](https://www.mindstudio.ai/blog/avoid-vibecoded-landing-pages); [Krebs: design slop](https://adriankrebs.ch/blog/design-slop/).

### 2.4 One huge radius everywhere
- Avoid: `rounded-2xl` on every box, pill buttons next to round cards next to round inputs.
- Instead: the kit's radius tokens, by role (control, container, overlay), as the kit defines them.
- Why: one radius vocabulary is intentional; uniform huge radius is the default. The DEV author bans `rounded-2xl/3xl` in lint.
- Sources: [Fix the AI-generated look (DEV)](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh); [GeekyAnts](https://geekyants.com/blog/why-everything-your-ai-builds-looks-the-same); [Jean Galea: AI UI looks generic](https://jeangalea.com/ai-ui-looks-generic/).

### 2.5 Border plus shadow plus fill on one box
- Avoid: a box that has a visible border, a drop shadow and a tinted fill at once.
- Instead: pick one separation device per box: a fill step, or a border token, or (for floating layers) a shadow.
- Why: Refactoring UI: "use fewer borders"; separate with shadow, background colour or space instead.
- Sources: [Refactoring UI](https://www.refactoringui.com/); [Linear: behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh); [Fix the AI-generated look (DEV)](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh).

### 2.6 Divider lines everywhere
- Avoid: a line between every row, panel and section.
- Instead: spacing and fill steps first; a hairline token only where grouping is otherwise unclear.
- Why: Linear found divider lines "quietly proliferated" and softened them.
- Sources: [Linear: behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh); [Refactoring UI](https://www.refactoringui.com/).

**How to check:** Squint at the screen. If you see boxes before content, fail. Count nested containers: more than two levels fails. Pick any box: it may use one of border, fill, shadow, not all three. List the radii on screen: each must map to a kit radius token.

---

## 3. Typography

### 3.1 One font, many weights, no hierarchy
- Avoid: everything in the same size with bold sprinkled on; three or four weights on one panel.
- Instead: the kit's type scale: a few sizes, two weights at most per panel. Rank by size, colour step and position.
- Why: hierarchy is the base of a legible tool; Refactoring UI teaches de-emphasising secondary data.
- Sources: [Refactoring UI](https://www.refactoringui.com/); [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui); [Robots on Payroll](https://robotsonpayroll.substack.com/p/how-to-avoid-that-vibe-coded-look).
- Disagreement: Anthropic's guidance asks for "extreme" weight and 3x size jumps. That fits expressive marketing pages. In a tool, keep contrast modest and use the kit's scale.

### 3.2 Oversized display type in a tool
- Avoid: hero-size headings in panels, empty states or dialogs.
- Instead: panel titles and section headings at the kit's small and medium steps.
- Why: big headlines are a landing-page habit; they waste room in a dense layout.
- Sources: [GeekyAnts](https://geekyants.com/blog/why-everything-your-ai-builds-looks-the-same); [Figma: designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/); [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui).

### 3.3 All-caps labels and section titles
- Avoid: uppercase, letter-spaced tags above every section; uppercase navigation.
- Instead: sentence case labels at the kit's label style.
- Why: uppercase section labels are a tell (about 10% of sites) and slow reading.
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Krebs: design slop](https://adriankrebs.ch/blog/design-slop/).

### 3.4 Centred text blocks
- Avoid: centre-aligned titles, descriptions and form labels.
- Instead: left-aligned text; centre only a single short line inside a button or badge.
- Why: centred titles appear on 23.5% of sites and are part of the stock hero recipe.
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic).

### 3.5 Trendy font stunts
- Avoid: a serif italic accent word, a fashionable display font beside the body font, "Inter everywhere" chosen by default.
- Instead: the font the kit declares. Do not swap or pair another.
- Why: the "Space Grotesk, Geist, Fraunces, serif italic" set is already a tell. Anthropic notes models converge on whatever is named as the alternative.
- Sources: [Krebs: design slop](https://adriankrebs.ch/blog/design-slop/); [Anthropic cookbook](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics); [Blode](https://blode.co/writing/you-dont-have-to-make-ai-slop).
- Disagreement: Anthropic and Blode say "avoid Inter, pick a distinctive font". For kitvas the kit owns the font, so the answer is the kit's font, not a new one.

**How to check:** Count text sizes and weights on one panel: more than four sizes or three weights fails. Search for `text-transform: uppercase`, `text-align: center` and any font-family not from a kit token.

---

## 4. Layout

### 4.1 Centred hero in a tool
- Avoid: a centred headline, subline and one big button as the top of a panel or empty canvas.
- Instead: start with the work: the list, the canvas, the form. Left-aligned, aligned to the panel grid.
- Why: the hero is the landing-page formula, and it does not belong in a work surface.
- Sources: [MindStudio](https://www.mindstudio.ai/blog/avoid-vibecoded-landing-pages); [Jean Galea](https://jeangalea.com/ai-ui-looks-generic/); [Figma: designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/).

### 4.2 Bento grids for no reason
- Avoid: a grid of evenly weighted rounded tiles, each with a label, an icon and a line.
- Instead: a list, table or single column ordered by the user's task. Use a grid only when items are truly modular and equal.
- Why: "everything, equally" emphasised means nothing leads.
- Sources: [AI Smells: Bento Box Sprawl](https://aismells.pages.dev/bento-box-sprawl.html); [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [GeekyAnts](https://geekyants.com/blog/why-everything-your-ai-builds-looks-the-same).
- Disagreement: some articles still praise bento for showing importance by tile size. Fine in marketing; not needed in an editor.

### 4.3 Meaningless stat and KPI cards
- Avoid: rows of big numbers with small captions that nobody acts on.
- Instead: show a number only if the user can act on it, in the place where they act, in body-sized text.
- Why: stat banners are a tell (12%), and they invite invented numbers.
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Landing Doctor](https://landingdoctors.com/guides/why-ai-landing-pages-convert-worse).

### 4.4 Inconsistent spacing
- Avoid: gaps of 10, 14, 18 and 22 px mixed; arbitrary padding per component.
- Instead: the kit's spacing tokens only; the same gap for the same relation.
- Why: "redesign tax": duplicated components and inconsistent spacing pile up in unmanaged generation. Align labels, icons and buttons on one grid.
- Sources: [GeekyAnts](https://geekyants.com/blog/why-everything-your-ai-builds-looks-the-same); [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui); [PostHog: an engineer's guide to vibe design](https://newsletter.posthog.com/p/an-engineers-guide-to-vibe-design).

### 4.5 Decorative whitespace in a dense tool
- Avoid: big padding, tall rows and wide gutters that push controls out of view.
- Instead: the kit's compact density step; keep properties visible without scrolling; reveal rare controls on demand.
- Why: Figma kept density through progressive disclosure and "speed is a feature"; floating panels cramped the canvas and were reversed.
- Sources: [Figma: designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/); [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui).

### 4.6 Identical cards with an icon on top
- Avoid: the same card repeated three or four times, each with icon, bold word and one sentence.
- Instead: a list with real labels, or vary weight by importance.
- Why: identical rhythm signals no one decided what matters.
- Sources: [Krebs: design slop](https://adriankrebs.ch/blog/design-slop/); [MindStudio](https://www.mindstudio.ai/blog/avoid-vibecoded-landing-pages).

**How to check:** Cover the content and view the layout: if it is a hero over a tile grid, fail. Count controls visible at a 1440 x 900 viewport against the previous version: fewer without reason fails. Measure gaps: every value must be a spacing token.

---

## 5. Icons and illustration

### 5.1 An icon on every label
- Avoid: a decorative icon before each menu item, field and heading.
- Instead: icons only for tools and states where the glyph is the standard one; text for the rest.
- Why: Linear cut icon use because it "had grown excessive"; a tip from practice: "shorten ... remove labels that aren't needed", and drop decoration.
- Sources: [Linear: behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh); [Blode](https://blode.co/writing/you-dont-have-to-make-ai-slop).

### 5.2 Mismatched icon sets
- Avoid: stroke, filled and duotone icons mixed; two sizes and stroke widths on one bar.
- Instead: the kit's icon set at its defined sizes and stroke.
- Why: mixed sets signal pasted parts. Genesys: add to an existing icon and "don't introduce new visual styles".
- Sources: [Genesys Spark: AI iconography](https://spark.genesys.com/latest/foundations/ai-foundations/ai-iconography-eHo6ir4h-eHo6ir4h); [Linear: behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh).

### 5.3 Emoji as icons or in navigation
- Avoid: emoji in sidebars, headings, buttons, badges.
- Instead: kit icon or plain text.
- Why: emoji render differently per platform and read as AI-made.
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Robots on Payroll](https://robotsonpayroll.substack.com/p/how-to-avoid-that-vibe-coded-look).

### 5.4 Blob illustrations and glossy 3D shapes
- Avoid: abstract blobs, floating orbs, particles, glossy 3D objects as decoration.
- Instead: show the real thing: a screenshot, the actual component, or nothing.
- Why: "glowing orbs, floating dashboards, particles" are the standard start-up look; they carry no information.
- Sources: [Why AI standardises start-up identity](https://www.startupbusiness.it/en/why-ai-standardises-the-visual-identity-of-start-ups-and-how-to-avoid-it/177662/); [MindStudio](https://www.mindstudio.ai/blog/avoid-vibecoded-landing-pages).

### 5.5 Icon-only controls with no name
- Avoid: a bare icon button whose meaning must be guessed.
- Instead: an accessible name and a tooltip; a visible label where space allows.
- Why: Rauno requires an `aria-label`; Figma kept visible labels after minimal labelling hurt accessibility.
- Sources: [Rauno Freiberg: interfaces](https://interfaces.rauno.me/); [Figma: designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/).

**How to check:** Cover the icons: if the screen still reads, remove the icons. Check that all icons come from one set, one stroke, one size per role. Search for emoji code points in the UI strings.

---

## 6. Motion

### 6.1 Animation on frequent actions
- Avoid: transitions on every hover, selection, panel toggle or keyboard move.
- Instead: no animation for frequent, low-novelty actions. Keyboard-driven actions never animate.
- Why: Emil Kowalski: frequency decides; Raycast opens hundreds of times a day with no animation.
- Sources: [Emil Kowalski: you don't need animations](https://emilkowal.ski/ui/you-dont-need-animations); [Rauno Freiberg: interfaces](https://interfaces.rauno.me/).

### 6.2 Slow, bouncy, scale-from-zero motion
- Avoid: springs and overshoot, dialogs that scale in from 0, press scale to 0.8, durations over 300 ms.
- Instead: the kit's motion tokens; short fades or small offsets; ease-out; animate opacity and transform only.
- Why: slow motion feels laggy in a tool.
- Sources: [Emil Kowalski](https://emilkowal.ski/ui/you-dont-need-animations); [Rauno Freiberg: interfaces](https://interfaces.rauno.me/); [Blode](https://blode.co/writing/you-dont-have-to-make-ai-slop).
- Disagreement: Rauno says at most 200 ms, Emil says under 300 ms, Blode says 200 to 300 ms. Use the kit's token and never exceed 200 ms for direct interactions (the stricter source wins).

### 6.3 Ignoring reduced motion
- Avoid: parallax, large slides, auto-playing loops with no `prefers-reduced-motion` branch.
- Instead: wrap motion in the media query; replace large movement with a crossfade; stop looping animation when off screen.
- Why: motion triggers vestibular problems. Colour and opacity fades are safe.
- Sources: [Smashing: designing with reduced motion](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities); [Primer: motion and animation](https://primer.style/accessibility/design-guidance/motion-and-animation); [Rauno Freiberg: interfaces](https://interfaces.rauno.me/) (it does not mention reduced motion; Smashing and Primer do).

### 6.4 Shimmer skeletons that never resolve
- Avoid: a skeleton or shimmer as the only feedback for a long wait; placeholders that do not match the final layout.
- Instead: for short waits, a skeleton matching the real layout; for long or agent work, real status (what is happening, progress, cancel).
- Why: skeletons suggest progress without giving any; their reliable gain is layout stability.
- Sources: [AWS Builder Center / Viget summary via search (not read)](#sources-not-read); [Telerik: AI UX patterns, user control](https://www.telerik.com/blogs/ai-ux-patterns-user-control); [Primer: motion and animation](https://primer.style/accessibility/design-guidance/motion-and-animation).
- Note: NN/g says skeletons suit full-page loads only ([NN/g: skeleton screens](https://nngroup.com/articles/skeleton-screens/), seen in search only).

### 6.5 Theme-switch and decorative loops
- Avoid: colour transitions across the whole UI when the theme changes; endless background loops.
- Instead: switch tokens instantly. Pause or remove loops that are not visible.
- Why: Rauno: switching themes must not trigger transitions; looping animations pause off screen.
- Sources: [Rauno Freiberg: interfaces](https://interfaces.rauno.me/); [Primer: motion and animation](https://primer.style/accessibility/design-guidance/motion-and-animation).

**How to check:** Do the action 20 times in a row. If the animation annoys you, remove it. Toggle the OS reduced-motion setting and reload: any large movement left fails. Time every transition against the kit's token.

---

## 7. AI features

### 7.1 Sparkle and magic-wand icons everywhere
- Avoid: a sparkle on every button, menu and heading that touches Claude; the star-like glyph alone.
- Instead: a text label that names the action ("Propose variants", "Apply"). If the kit has one AI mark, use it once on the AI tab, not on every control.
- Why: NN/g found no participant linked sparkles to AI; users read them as save, effects or reward.
- Sources: [NN/g: AI sparkles icon problem](https://www.nngroup.com/articles/ai-sparkles-icon-problem/); [Genesys Spark: AI iconography](https://spark.genesys.com/latest/foundations/ai-foundations/ai-iconography-eHo6ir4h-eHo6ir4h); [SAP Fiori: AI buttons](https://www.sap.com/design-system/fiori-design-android/v26-4/in-app-ai-design/components/ai-buttons).
- Disagreement: NN/g still allows sparkles "for now" for AI; Genesys reserves it for one product line; SAP wants a leading star icon but no "AI" in the label. kitvas picks the strict path: label first, one mark at most.

### 7.2 "AI" badges and AI-styled surfaces
- Avoid: "AI" pills, glowing AI borders, a special gradient for AI content.
- Instead: mark AI-made changes by origin in the Changes list (who proposed, which request), in neutral kit styling.
- Why: styling that exists only to show "this is AI" becomes decoration. Carbon limits its AI style to identification, "never as decoration".
- Sources: [IBM Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/); [Smashing: design patterns for AI interfaces](https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/).
- Disagreement: Carbon's way to mark AI is glow and gradient plus an AI label with an explain popover. Use its label-and-explain idea, not the glow.

### 7.3 A chat bubble bolted onto a tool
- Avoid: a floating chat widget or a bare text box as the main way to ask for a change.
- Instead: act on the selection (an element, a section); offer the request field with scope shown ("Hero, section 2"); show results as variants.
- Why: chat as default puts the work of stating intent on the user; global prompts for local edits are an anti-pattern.
- Sources: [Smashing: design patterns for AI interfaces](https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/); [Microsoft HAX guidelines](https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/).

### 7.4 Fake typing, fake thinking
- Avoid: character-by-character reveal of text that is already complete, "thinking..." animations with no real step behind them.
- Instead: show the real state: queued, working on section X, done, failed. Allow stop at any time.
- Why: a stop control is an "emergency brake"; non-abortable processes mean the user is not in control.
- Sources: [Telerik: AI UX patterns, user control](https://www.telerik.com/blogs/ai-ux-patterns-user-control); [web.dev: design AI user experiences](https://web.dev/learn/ai/ux-patterns).

### 7.5 Confident output with no provenance
- Avoid: a change that appears with no source, no reason, no scope.
- Instead: every AI change states the request that caused it, what it touched (files, tokens) and why; flag off-kit values. Admit uncertainty.
- Why: HAX asks the system to "make clear why the system did what it did"; web.dev asks for neutral labels and admitted uncertainty.
- Sources: [Microsoft HAX guidelines](https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/); [web.dev: design AI user experiences](https://web.dev/learn/ai/ux-patterns); [IBM Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/).

### 7.6 "Generate" with no preview
- Avoid: a button that writes to code straight away.
- Instead: preview the variant on the canvas, show the diff, then Apply; Apply is one undo step.
- Why: constrained AI works best when the user picks from drafts and accepts or edits before saving.
- Sources: [web.dev: design AI user experiences](https://web.dev/learn/ai/ux-patterns); [Telerik: AI UX patterns, user control](https://www.telerik.com/blogs/ai-ux-patterns-user-control); [Microsoft HAX guidelines](https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/).

### 7.7 All-or-nothing undo and no history
- Avoid: "regenerate everything" as the only retry; no way back after Apply.
- Instead: keep the version timeline; let the user keep part of a result; restore the original after an edit ("revert to AI" idea).
- Why: non-deterministic output needs history; all-or-nothing undo wipes out good output.
- Sources: [Telerik: AI UX patterns, user control](https://www.telerik.com/blogs/ai-ux-patterns-user-control); [IBM Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/).

### 7.8 Anthropomorphic assistant copy and too many options
- Avoid: "I'd love to help!", an avatar or name for the assistant, 10 variants.
- Instead: neutral action labels and plain statements. Rank 1 to 3 variants with one line saying how each differs.
- Why: neutral labels ("Show titles") beat generic ones ("Ask AI"); forced ranking avoids option dumps.
- Sources: [web.dev: design AI user experiences](https://web.dev/learn/ai/ux-patterns); [Smashing: design patterns for AI interfaces](https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/); [SAP Fiori: AI buttons](https://www.sap.com/design-system/fiori-design-android/v26-4/in-app-ai-design/components/ai-buttons).

**How to check:** Find every AI entry point. Each must: have a text name, show a preview before any write, name its scope, be stoppable, and be undoable in one step. Count sparkle glyphs: more than one fails.

---

## 8. Copy and states

### 8.1 Marketing tone inside a tool
- Avoid: "Unlock the power of...", "Supercharge", "Seamlessly", "Empower your team".
- Instead: verb plus object ("Add section", "Restore version 3"). Name the concrete thing.
- Why: abstract words ("powerful", "seamless", "robust") say nothing; "Empower, Unlock, Transform" openings mark generic copy.
- Sources: [Fix the AI-generated look (DEV)](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh); [Landing Doctor](https://landingdoctors.com/guides/why-ai-landing-pages-convert-worse); [Demand Curve growth newsletter 268 (search summary only)](#sources-not-read).

### 8.2 Filler and em-dash-heavy sentences
- Avoid: long lead-ins, em dashes joining clauses, three-part rhythm ("fast, simple, powerful").
- Instead: one short sentence; a label instead of a sentence where possible.
- Why: shorten paragraphs to sentences and sentences to labels.
- Sources: [Blode](https://blode.co/writing/you-dont-have-to-make-ai-slop).
- Disagreement: the em dash as a tell is disputed; some say removing it does not fix weak copy ([Search Engine Land summary, not read](#sources-not-read)). The rule targets filler, not one character.

### 8.3 Emoji in labels
- Avoid: emoji in buttons, tabs, toasts, empty states.
- Instead: text, or a kit icon.
- Why: see 5.3.
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop).

### 8.4 Vague errors
- Avoid: "Something went wrong", "Oops", "Invalid input", "Try again later".
- Instead: problem, cause, next step: "We could not save version 4. The file is locked by another edit. Close it and try again."
- Why: users read the first line; vague text leaves them stuck.
- Sources: [Elastic UI: how to write good error messages](https://eui.elastic.co/docs/patterns/error-messages/how-to-write-good-error-messages/); [Smashing: design patterns for AI interfaces](https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/).

### 8.5 Fake data that looks real
- Avoid: invented user names, metrics, dates or counts in the studio, or sample data shown as if it were the user's.
- Instead: show real project data; where none exists, an honest empty state or clearly marked sample data.
- Why: invented proof "filled the proof slot with a confident guess".
- Sources: [Landing Doctor](https://landingdoctors.com/guides/why-ai-landing-pages-convert-worse); [Jean Galea](https://jeangalea.com/ai-ui-looks-generic/).

### 8.6 Cheerful empty states with mascots
- Avoid: illustration, jokes or "You're all caught up!" in a work panel.
- Instead: one line saying what is missing and the one action to add it.
- Why: Rauno: empty states should prompt to create a new item.
- Sources: [Rauno Freiberg: interfaces](https://interfaces.rauno.me/); [Figma: designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/).

### 8.7 Toasts for everything
- Avoid: a toast for every save, hide, lock or note.
- Instead: show the result in place (the item appears, the badge changes). Keep failures visible inline until read.
- Why: toasts vanish, miss screen readers and users learn to ignore them. For a simple copy, a short inline check beats a notification.
- Sources: [Primer: accessible notifications and messages](https://primer.style/accessibility/toasts/); [Rauno Freiberg: interfaces](https://interfaces.rauno.me/).
- Disagreement: LogRocket and Carbon accept toasts for brief confirmations. Allow one only for an action that has no visible result, and make it keyboard reachable.

**How to check:** Read every string aloud. If it could sit in any other product, fail. Search for "unlock", "supercharge", "seamless", "oops", "something went wrong". Trigger each error: it must say what failed and what to do.

---

## 9. Process smells

### 9.1 Default everything
- Avoid: shipping the first output; stock shadcn or Tailwind styling; theme values nobody chose.
- Instead: every colour, radius, space and shadow resolves to a kit token, and a person decided the screen's job.
- Why: "the first output was shipped unchanged" is the tell, not the library itself.
- Sources: [Blode](https://blode.co/writing/you-dont-have-to-make-ai-slop); [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [MindStudio](https://www.mindstudio.ai/blog/avoid-vibecoded-landing-pages).

### 9.2 Components used because the library has them
- Avoid: a tooltip on a label that is already clear; a modal where inline editing works; a card because Card exists.
- Instead: add a component only when a task needs it; write down why a pattern was chosen.
- Why: decoration like redundant tooltips signals no decision.
- Sources: [Blode](https://blode.co/writing/you-dont-have-to-make-ai-slop); [GeekyAnts](https://geekyants.com/blog/why-everything-your-ai-builds-looks-the-same).

### 9.3 Dark mode as an afterthought
- Avoid: auto-inverted colours; one theme designed, the other derived; permanent dark with dim greys as a "premium" look.
- Instead: check each screen in both themes using the kit's theme tokens; same contrast targets in both.
- Why: dark mode is a separate palette; always-dark with grey text is a tell.
- Sources: [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui); [Krebs: design slop](https://adriankrebs.ch/blog/design-slop/); [GeekyAnts](https://geekyants.com/blog/why-everything-your-ai-builds-looks-the-same).

### 9.4 Tokens not enforced
- Avoid: raw hex values, arbitrary spacing, inline styles in generated code.
- Instead: lint or test for raw values; semantic tokens only; review the rendered result, not the diff.
- Why: prompts drift; enforcement does not.
- Sources: [GeekyAnts](https://geekyants.com/blog/why-everything-your-ai-builds-looks-the-same); [Fix the AI-generated look (DEV)](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh); [PostHog: an engineer's guide to vibe design](https://newsletter.posthog.com/p/an-engineers-guide-to-vibe-design).

### 9.5 Taste, exploration and build fused in one step
- Avoid: asking for "modern and clean" and accepting the result.
- Instead: fix the direction from the kit first, explore a few variants, then build the chosen one.
- Why: fusing taste, exploration and spec leaves every choice open, so output falls to the average.
- Sources: [Superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic); [Why AI standardises start-up identity](https://www.startupbusiness.it/en/why-ai-standardises-the-visual-identity-of-start-ups-and-how-to-avoid-it/177662/); [Robots on Payroll](https://robotsonpayroll.substack.com/p/how-to-avoid-that-vibe-coded-look).

**How to check:** Run the reverse squint test: show a screenshot to a fresh model and ask which AI builder made it ([Robots on Payroll](https://robotsonpayroll.substack.com/p/how-to-avoid-that-vibe-coded-look)). Grep for raw colours and spacing. Open both themes side by side.

---

## For generated drafts

These patterns show up most in generated screens and components. Makers and sketchers use only kit components and `--kit-*` tokens. When the brief asks for something the kit cannot express, say so in the draft notes. Do not invent a look.

### D.1 Generic hero plus three feature cards
- Avoid: centred headline, restating subline, one button, then three identical icon cards.
- Instead: the kit's page and section components, arranged for the brief's actual content; give the strongest item the most space; use the product's real name and task.
- Why: this is the median Tailwind landing page.
- Sources: [MindStudio](https://www.mindstudio.ai/blog/avoid-vibecoded-landing-pages); [Fix the AI-generated look (DEV)](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p); [Jean Galea](https://jeangalea.com/ai-ui-looks-generic/).

### D.2 Gradient text and a badge above the title
- Avoid: gradient-filled headings; a capsule badge ("New", "Beta") above the H1.
- Instead: a heading in the kit's text token; put status in the page's data, not above the title.
- Why: both are listed tells (gradients 28%, capsule badge 4.7%).
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Krebs: design slop](https://adriankrebs.ch/blog/design-slop/).

### D.3 Fake testimonials and logo bars
- Avoid: invented quotes, placeholder company logos, "trusted by 10,000 teams".
- Instead: omit proof the brief did not supply. If a slot is required, use a clearly labelled placeholder component from the kit.
- Why: fabricated proof hurts more than none and gets forgotten in templates.
- Sources: [Landing Doctor](https://landingdoctors.com/guides/why-ai-landing-pages-convert-worse); [Superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic).

### D.4 Stat cards with invented numbers
- Avoid: rows of "99.9% uptime / 10k users / 4.9 rating" made up.
- Instead: numbers only from the brief; otherwise marked sample values in the kit's placeholder style.
- Why: stat banners are a tell (12%) and the numbers are guesses.
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Landing Doctor](https://landingdoctors.com/guides/why-ai-landing-pages-convert-worse).

### D.5 Lorem ipsum and "Unlock the power" copy
- Avoid: lorem ipsum, or filler that sounds like marketing.
- Instead: short realistic text for the brief's domain, with specific nouns and numbers from the brief.
- Why: placeholder text hides layout problems and ships by accident; generic copy fits any company.
- Sources: [Fix the AI-generated look (DEV)](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh); [Landing Doctor](https://landingdoctors.com/guides/why-ai-landing-pages-convert-worse); [Lovart: the Lorem Ipsum fallacy (search summary only)](#sources-not-read).

### D.6 Emoji icons
- Avoid: emoji as feature icons or nav icons.
- Instead: the kit's icon set, or no icon.
- Why: see 5.3.
- Sources: [Robots on Payroll](https://robotsonpayroll.substack.com/p/how-to-avoid-that-vibe-coded-look); [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop).

### D.7 Everything centred
- Avoid: every section centred on one axis.
- Instead: left-aligned text on the kit's layout grid; centre only what is truly symmetric.
- Why: centred titles and heroes are the stock layout.
- Sources: [Krebs via GIGAZINE](https://www.gigazine.net/gsc_news/en/20260423-design-slop); [Superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic).

### D.8 A decorative blob, orb or glow
- Avoid: abstract blobs, blurred colour orbs, mesh backgrounds behind content.
- Instead: the kit's plain background token; a real product view if an image is needed.
- Why: abstract backgrounds stand in for a missing idea.
- Sources: [MindStudio](https://www.mindstudio.ai/blog/avoid-vibecoded-landing-pages); [Why AI standardises start-up identity](https://www.startupbusiness.it/en/why-ai-standardises-the-visual-identity-of-start-ups-and-how-to-avoid-it/177662/).

### D.9 Logos and icons from the sketcher
- Avoid: a logo or icon that is a gradient blob, a sparkle, or a generic "AI" glyph; three sketches that differ only in colour.
- Instead: three sketches that differ in idea (shape, metaphor), all drawn in the kit's stroke, radius and colours.
- Why: variants must be real alternatives; "use AI to generate variations, not to choose the direction".
- Sources: [Why AI standardises start-up identity](https://www.startupbusiness.it/en/why-ai-standardises-the-visual-identity-of-start-ups-and-how-to-avoid-it/177662/); [Genesys Spark: AI iconography](https://spark.genesys.com/latest/foundations/ai-foundations/ai-iconography-eHo6ir4h-eHo6ir4h).

**How to check:** The competitor test: swap in another company's name. If the draft still works, fail. Search the draft for `lorem`, "10,000", "trusted by", emoji, `gradient`, `blur`. Run the reverse squint test on the screenshot.

---

## Review checklist

Mark: [S] studio and editor, [D] generated drafts, [B] both. Answer yes or no on every screen. Any "no" must be fixed or explained.

1. [B] Is there exactly one accent colour, taken from kit tokens, used only for action and selection?
2. [B] Are all gradients, glows, blurs and coloured shadows absent?
3. [B] Does every colour, radius, space and shadow resolve to a kit token?
4. [B] Is body text readable on its surface in both themes?
5. [B] Does each box use one of border, fill or shadow, with at most two nesting levels?
6. [B] Is text left-aligned, sentence case, with a clear hierarchy of at most four sizes?
7. [B] Is any icon present only where it carries meaning, from one set, with no emoji?
8. [S] Does the work (canvas, list, form) come first, with no hero, bento grid or KPI cards?
9. [S] Is the density at the kit's compact step, with key controls visible without scrolling?
10. [S] Is every motion under the kit's token, absent on frequent actions, and safe under reduced motion?
11. [S] Does each AI entry point have a text name, a visible scope, a preview before write, a stop, and a one-step undo?
12. [S] Does each AI change show its request, scope and reason, with off-kit values flagged?
13. [S] Is there at most one AI mark on screen, with no "AI" badge or special AI gradient?
14. [S] Do errors say what failed, why, and what to do?
15. [S] Are results shown in place, with toasts only for actions with no visible result?
16. [S] Does each empty state say what is missing and offer one action, with no mascot?
17. [D] Is the page built from kit components arranged for the brief, not a hero plus three cards?
18. [D] Are all testimonials, logos, stats and numbers either from the brief or marked as sample?
19. [D] Is the copy specific to the brief, with no lorem and no "unlock" language?
20. [D] Do the three sketches differ in idea, not only in colour?
21. [B] Does the screen pass the competitor test and the reverse squint test?
22. [B] Does the screen look right in both themes?

---

## Sources

All pages below were fetched and read unless marked otherwise.

### Essays and analyses of AI-generated UI sameness
- [Adrian Krebs, design slop](https://adriankrebs.ch/blog/design-slop/)
- [GIGAZINE: Show HN design slop analysis](https://www.gigazine.net/gsc_news/en/20260423-design-slop)
- [Why every AI-built website looks the same: blame Tailwind's indigo-500 (DEV)](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p)
- [How to fix the AI-generated look in your frontend (DEV)](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh)
- [Blode: you don't have to make AI slop](https://blode.co/writing/you-dont-have-to-make-ai-slop)
- [Jean Galea: AI UI looks generic](https://jeangalea.com/ai-ui-looks-generic/)
- [Robots on Payroll: how to avoid that vibe coded look](https://robotsonpayroll.substack.com/p/how-to-avoid-that-vibe-coded-look)
- [MindStudio: avoid vibecoded landing pages](https://www.mindstudio.ai/blog/avoid-vibecoded-landing-pages)
- [Superdesign: why AI design looks generic](https://superdesign.dev/blog/why-ai-design-looks-generic)
- [PostHog: an engineer's guide to vibe design](https://newsletter.posthog.com/p/an-engineers-guide-to-vibe-design)
- [Why AI standardises the visual identity of start-ups](https://www.startupbusiness.it/en/why-ai-standardises-the-visual-identity-of-start-ups-and-how-to-avoid-it/177662/)
- [GeekyAnts: why everything your AI builds looks the same](https://geekyants.com/blog/why-everything-your-ai-builds-looks-the-same)
- [AI Smells: Bento Box Sprawl](https://aismells.pages.dev/bento-box-sprawl.html)
- [Landing Doctor: why AI landing pages convert worse](https://landingdoctors.com/guides/why-ai-landing-pages-convert-worse)

### Model and tool vendor guidance
- [Anthropic cookbook: prompting for frontend aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- [Claude blog: improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)

### Tool-UI craft and design-system writing
- [Rauno Freiberg: interfaces](https://interfaces.rauno.me/)
- [Refactoring UI](https://www.refactoringui.com/) (chapter headings only; the page has no body text)
- [Linear: how we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear: behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)
- [Figma: our approach to designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/)
- [Emil Kowalski: you don't need animations](https://emilkowal.ski/ui/you-dont-need-animations)
- [Josh Comeau: designing beautiful shadows](https://www.joshwcomeau.com/css/designing-shadows/)
- [Primer: motion and animation](https://primer.style/accessibility/design-guidance/motion-and-animation)
- [Primer: accessible notifications and messages](https://primer.style/accessibility/toasts/)
- [Smashing Magazine: designing with reduced motion](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities)
- [Elastic UI: how to write good error messages](https://eui.elastic.co/docs/patterns/error-messages/how-to-write-good-error-messages/)

### AI interaction patterns and AI iconography
- [NN/g: the AI sparkles icon problem](https://www.nngroup.com/articles/ai-sparkles-icon-problem/)
- [Genesys Spark: AI iconography](https://spark.genesys.com/latest/foundations/ai-foundations/ai-iconography-eHo6ir4h-eHo6ir4h)
- [SAP Fiori: AI buttons](https://www.sap.com/design-system/fiori-design-android/v26-4/in-app-ai-design/components/ai-buttons)
- [IBM Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/)
- [Microsoft: guidelines for human-AI interaction](https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/)
- [web.dev: design AI user experiences](https://web.dev/learn/ai/ux-patterns)
- [Telerik: AI UX patterns, user control](https://www.telerik.com/blogs/ai-ux-patterns-user-control)
- [Smashing Magazine: design patterns for AI interfaces](https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/)

### Sources not read
These appeared in search results only. They are cited as pointers and carry no rule alone.
- [Glassmorphism: the most beautiful trap in modern UI design (Medium)](https://medium.com/design-bootcamp/glassmorphism-the-most-beautiful-trap-in-modern-ui-design-a472818a7c0a) (page blocked)
- [NN/g: skeleton screens](https://nngroup.com/articles/skeleton-screens/)
- [Viget: a bone to pick with skeleton screens](https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens) (page blocked)
- [Demand Curve: growth newsletter 268](https://www.demandcurve.com/newsletters/growth-newsletter-268)
- [Search Engine Land: AI writing tics engagement study](https://searchengineland.com/ai-writing-tics-engagement-study-470051)
- [Lovart: the Lorem Ipsum fallacy](https://www.lovart.ai/blog/lorem-ipsum-problem-real-text-ai-design)
- [UX Collective: nobody asked for the sparkle button](https://uxdesign.cc/nobody-asked-for-the-sparkle-button-ae54ab5065c6) (page blocked)
