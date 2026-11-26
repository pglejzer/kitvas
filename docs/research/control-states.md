# Control states: research

Written on 2026-11-26, after a generated dashboard passed every check and still failed in use: a
pressed toggle button turned white on white on hover, two filter selects changed nothing, a column
showed a sort arrow and could not be sorted. The checks measured a page only at rest.

This file is the research. What binds the product is elsewhere:

- the rules agents follow when they write a section: `reference/controls.md`;
- the rules the checks run, each with its threshold and source: the guideline book
  (`kitvas guidelines`).

Three notes follow, each written by a research agent from pages it fetched. A claim it could not
tie to a fetched page stands under "Not found" in its part.

## Contents

- Checked at the source
- Part 1. What the standards and design systems require
- Part 2. How to put a control into a state and measure it
- Part 3. Controls that work: toggles, filters, sorting, selects, search

## Checked at the source

The two sentences the new contrast rule rests on were read again in the pages themselves, not
through a summary, on 2026-11-26.

WCAG 2.2, Understanding 1.4.3 Contrast (Minimum), level AA
(https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html):

> This success criterion applies to text in the page, including placeholder text and text that is
> shown when a pointer is hovering over an object or when an object has keyboard focus. If any of
> these are used in a page, the text needs to provide sufficient contrast.

> User Interface Components that are not available for user interaction (e.g., a disabled control
> in HTML) are not required to meet contrast requirements.

So text keeps 4.5 to 1 (3 to 1 for large text) while its control is hovered or focused, and only an
inactive control is exempt.

WCAG 2.2, Understanding 1.4.11 Non-text Contrast, level AA
(https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html):

> Therefore, additional author-supplied visual treatments for hover are not "required to identify"
> the hover state. Those treatments can be considered supplemental and do not themselves need to
> contrast 3:1 against the background.

The same passage goes on to say that a hover effect must not cause a component itself to lose
sufficient contrast against adjacent colors, or cause the visual indicators for other states, such
as focus or selection, to lose sufficient contrast.

So a hover effect needs no contrast of its own, and it may not take contrast away from the control
or from the mark of another state, such as selected.

## Part 1. What the standards and design systems require

The note's own title: Interactive control states: standards and practice

Method note. Every quote below was returned by a page fetch made for this note. The fetch tool summarises pages with a small model, so quotes are as returned, and some are split fragments. Items from search-result summaries only (not fetched) are in "Not found". Budget used: 8 searches, 30 fetches.

### Table

Columns: Practice | Statement | State covered | Threshold | Source | URL | Quote | auto/manual | Measure

| Practice | Statement | State covered | Threshold | Source | URL | Quote | auto/manual | Measure |
|---|---|---|---|---|---|---|---|---|
| Text contrast in every state | Text has 4.5:1 against its background; large text 3:1. The only state exemption is an inactive component. The rule has no hover or pressed exception, so a state's text must pass (derived reading, see Disputed). | rest, hover, pressed, selected, focus, error, read-only | 4.5:1 (3:1 large) | WCAG 2.2 SC 1.4.3 (AA) | https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html | "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1, except for the following:" and "Text or images of text that are part of an inactive user interface component, that are pure decoration," ... "have no contrast requirement." | auto | Force the state (CDP `CSS.forcePseudoState` or real hover/press), read computed `color` and the resolved background, compute WCAG ratio. |
| Non-text contrast of state indicators | Visual information needed to identify components and their states, such as selected or focused, needs 3:1 against adjacent colours. | selected, focus, checked, pressed indicator | 3:1 | WCAG 2.2 SC 1.4.11 (AA) | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | "The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent color(s)." / "any visual information necessary to indicate state, such as whether a component is selected or focused" | auto | In the selected state, compute ratio of the indicator (fill, border, check mark) to its surrounding colour from computed styles / pixel sample. |
| States need not contrast with each other | The criterion does not require changes in colour between states of one component to reach 3:1 when states are not shown side by side. | difference rest vs hover vs selected | none | WCAG 2.2 SC 1.4.11 Understanding | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | "does not require that changes in color that differentiate between states of an individual component" meet 3:1 when the states don't appear side by side. | auto (to know the limit) | Do not fail a check on state-to-state delta alone under WCAG. |
| Hover is not covered by 1.4.11 | The pointer is the hover indicator. Author hover styling is supplemental and needs no 3:1. | hover | none | WCAG 2.2 SC 1.4.11 Understanding | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | "The pointer itself, via its location, is the indicator of whether the user is hovering on a component." Author hover treatments "can be considered supplemental and do not themselves need to contrast 3:1 against the background." | auto (nothing to enforce) | Hover rules are checked against 1.4.3 and 1.4.11 as a rendered state (see rows 1, 2), not as a delta. |
| Disabled exemption | Components not available for interaction have no contrast requirement (text under 1.4.3, boundary/glyph under 1.4.11). | disabled, disabled + hover | none | WCAG 2.2 SC 1.4.11 and 1.4.3 Understanding | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | "User Interface Components that are not available for user interaction (e.g., a disabled control in HTML)" are not required to meet contrast requirements. | auto | Detect `:disabled` / `aria-disabled=true` and skip the contrast check; confirm the disabled element is not clickable (pointer-events/none, no handler). |
| Colour not the only means | Colour must not be the only visual means of conveying information, indicating an action, prompting a response or distinguishing an element. | selected, on, error, link, hover/pressed | none (no number) | WCAG 2.2 SC 1.4.1 (A) | https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html | "Color is not used as the only visual means of conveying information," and "indicating an action, prompting a response, or distinguishing a visual element." | partly auto | Auto: diff computed styles and a pixel diff between states, flag when only colour-type properties (color, background-color, border-color, fill) differ. Manual: judge whether a non-colour cue is enough. |
| Focus visible | A keyboard operable UI has a mode where the focus indicator is visible. | focus-visible, selected + focus, error + focus | none | WCAG 2.2 SC 2.4.7 (AA) | https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html | "Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible." | auto | Tab to each control; compare screenshots/computed `outline`, `box-shadow` before and after; fail if identical. |
| Focus indicator stays | When shown, the indicator must remain visible. | focus | no time limit | WCAG 2.2 SC 2.4.7 Understanding | https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html | "The focus indicator must not be time limited: when the keyboard focus is shown, it must remain visible." | auto | Focus, wait, re-screenshot. |
| Focus not obscured | A focused component is not entirely hidden by author content (sticky bars, overlays). | focus | none (not entirely hidden) | WCAG 2.2 SC 2.4.11 (AA) | https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html | "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content." | auto | After focus, `elementFromPoint` at the element's box centre and corners; fail if another element covers all points. |
| Focus appearance (AAA only) | Indicator area at least a 2 CSS px perimeter of the unfocused component, and 3:1 between focused and unfocused pixels. | focus | 2 CSS px perimeter; 3:1 | WCAG 2.2 SC 2.4.13 (AAA, not required at AA) | https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html | "is at least as large as the area of a 2 CSS pixel thick perimeter of the unfocused component or sub-component, and" / "has a contrast ratio of at least 3:1 between the same pixels in the focused and unfocused states." | auto | Screenshot unfocused and focused, diff pixels, measure changed area and contrast of changed pixels. |
| Default browser focus style exempt | The browser default focus style is exempt from contrast (but must be visible). | focus | none | WCAG 2.2 SC 1.4.11 Understanding | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | "the default focus style is exempt from contrast requirements (but must still be visible)." | auto | If `outline-style` is unset by the author, skip contrast; if author sets a style, check 3:1. |
| Content on hover or focus | Extra content shown on hover/focus is dismissible, hoverable, persistent. | hover, focus (tooltips, menus) | none | WCAG 2.2 SC 1.4.13 (AA) | https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html | "If pointer hover can trigger the additional content, then the pointer can be moved over the additional content" / "A mechanism is available to dismiss the additional content without moving pointer hover or keyboard focus" | auto | Hover trigger, move pointer onto popup, check still visible; press Escape, check hidden while pointer stays. |
| Target size | Pointer targets are at least 24 by 24 CSS px, with exceptions (spacing, equivalent, inline, user agent, essential). | all states (size must not shrink on press) | 24 x 24 CSS px | WCAG 2.2 SC 2.5.8 (AA) | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html | "The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when:" | auto | `getBoundingClientRect()` in each state; check the spacing exception with 24 px circles. |
| State is programmatic | Name and role are determinable; states settable by the user are programmatically settable; changes are notified. | selected, pressed, checked, expanded | none | WCAG 2.2 SC 4.1.2 (A) | https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html | "states, properties, and values that can be set by the user can be programmatically set" / "notification of changes to these items is available to user agents, including assistive technologies" | auto | Check accessibility tree: toggle has `aria-pressed`, tab `aria-selected`, checkbox/switch `aria-checked`, nav `aria-current`; value flips after activation. (The page does not name `aria-pressed` etc.; that mapping is ARIA practice, not quoted here.) |
| No context change on focus | Moving focus does not start a change of context. | focus | none | WCAG 2.2 SC 3.2.1 (A) | https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html | "When any user interface component receives focus, it does not initiate a change of context." | auto (partial) | Focus each control; watch for URL, focus or window change. |
| No context change on input | Changing a setting does not auto-cause a change of context unless the user was told. | selected/changed value | none | WCAG 2.2 SC 3.2.2 (A) | https://www.w3.org/WAI/WCAG22/Understanding/on-input.html | "Changing the setting of any user interface component does not automatically cause a change of context" / "unless the user has been advised of the behavior before using the component." | auto (partial) | Change select/radio, watch for navigation. |
| State layer opacities (Material) | Material 3 token values for hover, focus, pressed, dragged state layers. | hover, focus, pressed, dragged | hover 0.08; focus 0.1; pressed 0.1; dragged 0.16 | Flutter's M3 token file (Google, mirrors Material tokens) | https://flutter.googlesource.com/mirrors/flutter/+/c83f80b2367baf0560fd9c73553a10b2fc51df5b/dev/tools/gen_defaults/data/state.json | `"md.sys.state.hover.state-layer-opacity": 0.08`, `"md.sys.state.focus.state-layer-opacity": 0.1`, `"md.sys.state.pressed.state-layer-opacity": 0.1`, `"md.sys.state.dragged.state-layer-opacity": 0.16` | auto | Resolve overlay alpha from computed styles; compare to the range. See Disputed for 0.12. |
| Selected needs another cue (Atlassian) | Pair selected colours with a checkmark, underline, border or shape change; hovered and pressed states are temporary and the selected item must stay recognisable. | selected, selected + hover | none | Atlassian Design System, Color | https://atlassian.design/foundations/color/ | "Pair selected colors with another visual cue, such as a checkmark, underline, border, or change in shape." / "keep a selected item recognizable during interaction." | partly auto | Pixel diff selected vs rest vs selected+hover: require a non-colour property difference (border-width, shape, icon, text-decoration) and that selected+hover still differs from plain hover. |
| Atlassian contrast tiers | UI essential to understanding the experience and text 24px or larger must pass 3:1; text under 24px 4.5:1. | all | 3:1 / 4.5:1 | Atlassian Design System, Color | https://atlassian.design/foundations/color/ | "Must pass 3:1 contrast:" ... "Any UI essential to understanding the experience and text 24px or larger" / "Must pass 4.5:1:" ... "Text smaller than 24px" | auto | As rows 1 and 2. |
| Do not rely on colour alone (Apple) | Do not use colour alone to differentiate objects, indicate interactivity or communicate essential information; use labels or glyph shapes. | selected, status, interactivity | none | Apple HIG, Color | https://developer.apple.com/design/human-interface-guidelines/color.md | "Avoid relying solely on color to differentiate between objects, indicate interactivity, or communicate essential information." / "you can use text labels or glyph shapes to identify objects or states." | partly auto | As the 1.4.1 row. |
| Focus is not colour only (Apple tvOS) | On tvOS, do not use only colour to indicate focus; use scale and animation. | focus | none | Apple HIG, Color (tvOS) | https://developer.apple.com/design/human-interface-guidelines/color.md | "Avoid using only color to indicate focus. Subtle scaling and responsive animation are the primary ways to denote interactivity when an element is in focus." | manual | Platform-specific (tvOS). |
| Focus changes shape, not colour (Fluent 2) | Control colour does not change on focus; the container gets a thicker stroke. Rest, hover, selected get darker in that order. | focus, rest, hover, selected | none | Fluent 2, Color | https://fluent2.microsoft.design/color | "For focus states, the color of the control does not change, but the container gets a thicker stroke" / "from the lightest rest state, to a darker hover, all the way to the darkest selected state." | auto | Read computed `border-width`/`outline-width` and fill luminance in each state. |
| Buttons look selectable (USWDS) | Use colour variations to distinguish static, hover, active; visible focus on tab. | rest, hover, active, focus | none | USWDS, Button | https://designsystem.digital.gov/components/button/ | "Make sure buttons look selectable. Use color variations to distinguish static, hover, and active states." / "Buttons should display a visible focus state when users tab to them." | auto | Computed-style diff rest vs hover vs active; focus diff. |
| Disabled is behaviour too (USWDS) | Disabled styles do not replace disabled behaviour; native disabled leaves the tab order; `aria-disabled` stays and the app must block activation; explain why. | disabled, disabled + hover | none | USWDS, Button | https://designsystem.digital.gov/components/button/ | "Disabled styles do not replace disabled behavior." / "An aria-disabled="true" button stays in the tab order, but your application must prevent activation by mouse, keyboard, and other input methods." | auto | Click disabled control, assert no handler fired; check tab order. |
| Focus colours (GOV.UK) | Focus uses yellow plus black with a thick bottom border, chosen to meet 1.4.11. | focus | none stated on page | GOV.UK Design System, Focus states | https://design-system.service.gov.uk/get-started/focus-states/ | "Focus states in the GOV.UK Design System use a combination of yellow and black, along with a thick bottom border" | manual | Opinion/pattern of one system. |
| Per-state defaults (Texas DIR) | Hover: slight background shift or underline, pointer cursor. Focus: 2px solid outline with offset. Selected: primary fill or border. Disabled: opacity 0.4, not-allowed, no pointer events, `aria-disabled`. Active: darkened background, scale(0.98). Default and interactive states >= 3:1. No state relies on colour alone. | all | 2px outline; opacity 0.4; scale 0.98; 3:1 | Texas DIR Accessibility, Interaction states | https://dir.texas.gov/txds/accessibility/interaction-states/ | "No state relies solely on color change — pair with border, underline, or icon change." / each default and interactive state needs a "≥ 3:1 contrast ratio" | partly auto | Computed styles per state. State government system, not one of the ten named; use as one more voice only. |
| Hover indicates clickable (NN/g) | Hover shows that a button is clickable; invisible to non-mouse users. | hover | none | NN/g, Button states communicate interaction | https://www.nngroup.com/articles/button-states-communicate-interaction/ | "is meant to indicate that the button is clickable." / "This state will obviously not be visible to users who do not use a mouse — for example, mobile users." | manual | Judgement. |
| Pressed gives timely feedback (NN/g) | Pressed confirms the action registered; late feedback causes repeat presses. | pressed/active | "timely" (no number on this page) | NN/g, Button states communicate interaction | https://www.nngroup.com/articles/button-states-communicate-interaction/ | "meant to give the user feedback that the action they performed was registered by the system" / "If this feedback is not timely, users will press the button multiple times and potentially cause issues." | auto (partial) | Press with mouse down held, screenshot: styles must differ from hover within one frame; manual for "timely". |
| Selected is not pressed (NN/g) | Selected differs from pressed (momentary). | selected vs pressed | none | NN/g, Button states communicate interaction | https://www.nngroup.com/articles/button-states-communicate-interaction/ | "It is not the same as the pressed state for a button." | manual | Judgement. |
| Test states with users (NN/g) | Test states for usability and visual distinctness. | all | none | NN/g | https://www.nngroup.com/articles/button-states-communicate-interaction/ | "it's a good idea to test them with real users to make sure they are usable and visually distinct." | manual | Person judges. |
| Do not style non-clickable as clickable (NN/g) | Backgrounds on headings make them look like buttons; the cost is confusion. | rest (false affordance) | none | NN/g, Clickable elements | https://www.nngroup.com/articles/clickable-elements/ | "For example, giving headings a background color will make them resemble buttons when they’re not." / "The miscues on this page create confusion." | partly auto | Auto: element with button-like style (background, border, radius, cursor:pointer) that has no handler/href/role. Manual: judgement. |
| hover media feature (MDN) | `@media (hover: hover)` tests whether the primary input can hover; `none` includes many touch devices. | hover on touch | none | MDN, hover media feature | https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover | "The primary input mechanism can conveniently hover over elements." / `none`: "The primary input mechanism cannot hover at all or cannot conveniently hover" | auto | Emulate touch (Playwright `hasTouch`, `isMobile`), tap, then compare computed style with rest; fail if hover style stuck. |
| Hover not covered by 1.4.11 (WebAIM) | After clarification, hover states are not covered by 1.4.11. | hover | none | WebAIM, 1.4.11 button examples | https://webaim.org/temp/1-4-11examples.htm | "UPDATE: It has been clarified that hover states are not covered by WCAG 1.4.11." | n/a | Confirms the WCAG row. |
| Hover/hybrid note (Smashing) | `hover` detects primary input hover; `any-pointer` detects if at least one input meets the condition. | hover on hybrid | none | Smashing Magazine | https://www.smashingmagazine.com/2022/03/guide-hover-pointer-media-queries/ | `hover` "detects when the primary input mechanism can hover over elements"; `any-pointer` "it'll detect if at least one of the device's input mechanisms meets the condition." | manual | Design choice. |

### Hard rules (WCAG, level A or AA)

1. 1.4.3 (AA): text 4.5:1, large 3:1. No exemption for hover, pressed or selected. Only inactive components are exempt.
2. 1.4.11 (AA): state indicators (selected, focused) 3:1 against adjacent colours. Disabled exempt. Hover not covered.
3. 1.4.1 (A): colour not the only means of conveying information or distinguishing an element.
4. 2.4.7 (AA): keyboard focus indicator visible, not time limited.
5. 2.4.11 (AA): focused component not entirely hidden by author content.
6. 1.4.13 (AA): hover/focus content dismissible, hoverable, persistent.
7. 2.5.8 (AA): pointer targets 24 by 24 CSS px, with exceptions.
8. 4.1.2 (A): states programmatically set and notified.
9. 3.2.1 and 3.2.2 (A): no change of context on focus or input without warning.

Not hard: 2.4.13 Focus Appearance is AAA.

### Common practice (several sources agree)

- Do not signal selected (or any state) by colour alone: Atlassian, Apple HIG, Texas DIR, USWDS (colour variations only, no rule), with WCAG 1.4.1 behind it.
- Hover, pressed and selected are three separate looks; selected must stay recognisable while hovered or pressed: Atlassian (explicit), Fluent 2 (rest lighter, hover darker, selected darkest), NN/g (selected is not pressed).
- Focus is shown by shape (stroke, outline, scale), not only colour: Fluent 2, Apple tvOS, GOV.UK, Texas DIR.
- Hover styles belong inside `@media (hover: hover)` so touch devices do not get stuck hover: MDN documents the query. The "sticky hover" problem itself is in Not found (no fetched source).
- Disabled controls must not act: USWDS, Texas DIR.

### Opinion (one source)

- Material 3 state-layer numbers (hover 0.08, focus 0.1, pressed 0.1, dragged 0.16): Flutter token file.
- Pressed: darken plus scale(0.98), disabled opacity 0.4: Texas DIR only.
- Pressed feedback must be timely: NN/g, no number on the fetched page.
- GOV.UK yellow and black focus.

### The bug above

A toggle in its pressed/on state (dark fill, white text) turned white on white on hover: the hover rule replaced the fill and left the text colour.

- 1.4.3 (AA): text in the hovered state is 1:1, far under 4.5:1. The only exemption is an inactive component; a hovered, enabled control is active. Source: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- 1.4.11 (AA): the "on" indicator (the dark fill) disappeared, so the visual information necessary to indicate state fell under 3:1 against adjacent colours. Source: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- 1.4.1 (A): with the fill gone, the selected state was carried by nothing visible. Atlassian: "keep a selected item recognizable during interaction." https://atlassian.design/foundations/color/
- 4.1.2 (A) is not broken (`aria-pressed` stays), but the visual state no longer matches it.
- 1.4.11 does not excuse the hover rule: hover itself is not covered, but the resulting rendered state still is, through 1.4.3.
- Machine check: force hover on every control in each state (rest, selected, pressed), compute text contrast against the effective background (blend alpha layers), fail under 4.5:1 (3:1 for large text). Also check selected+hover still differs from rest by more than colour.

### Not found or disputed

Not found (no fetched source):
- Material 3 state page itself: the fetch returned only the title. The numbers come from Flutter's token file. How Material treats selected + hover is not sourced.
- Carbon: accessibility overview fetched; it says only "Carbon color themes strive to comply with the WCAG 2.1 AA guidelines for contrast." and colour-blind users "Rely on non-color information to use an interface." No state numbers or selected+hover rule.
- Fluent 2: pressed and disabled guidance not on the colour page.
- Primer, Adobe Spectrum, Polaris: Primer pages fetched had no state content; the Spectrum URL gave 404; Polaris tokens redirected and was not refetched. Search summaries mention Primer "Don't rely on color alone", Polaris `-hover/-active/-selected/-disabled` token suffixes and `aria-pressed`, but I did not fetch those pages, so they are not cited.
- Apple HIG: no hover rule or state numbers; the control-size minimum (44 pt) was not fetched. Apple publishes the "avoid relying solely on color" text only.
- GOV.UK: page does not mention hover or colour-alone.
- NN/g: nothing fetched on selected vs hover or "0.1 second" feedback (a search summary claimed it; not fetched).
- web.dev, Baymard: not fetched. Sticky hover on touch: MDN `hover` is cited, but the page fetched did not state the sticky behaviour; CSS-Tricks and Stefan Judis appeared in search only.
- Combinations selected + focus, error + focus, disabled + hover: no source states a rule beyond the above. Disabled + hover: only the WCAG disabled exemption and USWDS "disabled styles do not replace disabled behavior". Error + focus: only Texas DIR (red border plus message via `aria-describedby`), and WCAG 1.4.13 exempts dismissing content that communicates an input error.
- Read-only and loading states: no fetched source.

Disputed or uncertain:
- Material focus and pressed opacity: the fetched Flutter file gives 0.1 each. Search results showed another Flutter snapshot and third-party docs with 0.12 (not fetched).
- Hover and 1.4.11: WebAIM staff once argued a subtle hover change fails 1.4.11 (search summary, not fetched); the fetched WebAIM page now says hover is not covered, and the W3C Understanding page agrees. Treat hover as not covered, but text contrast in the hovered state still counts under 1.4.3 (my reading of the criterion text, no source states it for hover directly).
- The Understanding page's 4.1.2 text does not name `aria-pressed`, `aria-selected`, `aria-current` or `aria-checked`; the mapping to those attributes is ARIA practice, not fetched here.
- Atlassian's 24px text tier for 3:1 comes from its own page and is not the WCAG large-text definition (18pt / 14pt bold); do not copy it as WCAG.

## Part 2. How to put a control into a state and measure it

The note's own title: Testing interactive states (hover, selected+hover, focus, active) in Chromium under Playwright

Method: pages fetched and quoted in this session. Anything marked "unconfirmed" comes from memory or from a search summary I could not tie to a fetched page. Searches used: 12 of 14. Fetches used: 30 of 30.

### What the existing tools miss

| Tool | State coverage | Quoted sentence | URL |
|---|---|---|---|
| axe-core `color-contrast` | One state, the page as rendered. The rule page says nothing about hover or focus. It lists unreliable cases: pseudo-element backgrounds, gradients, borders, overlap, background images. 1:1 results go to "incomplete". | "The page does not address hover or focus states" is my reading. Quoted limits: "Background colors in CSS pseudo-elements.", "CSS background gradients.", "Overlap by another element in the foreground - this sometimes comes up with tricky positioning.", "This rule will not report on text elements that have a `background-image`," | https://dequeuniversity.com/rules/axe/4.10/color-contrast |
| axe-core rule list | No rule for state contrast. `color-contrast` row: "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds". Hover is not mentioned. | (same) issue types "failure, needs review" | https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md |
| Playwright accessibility guide (`@axe-core/playwright`) | Scans the current state only. | "will scan the page in its current state when you call it." and "It is important to waitFor() the page to be in the desired state." Also: "Automated testing cannot detect all types of WCAG violations." Hover and focus not mentioned. | https://playwright.dev/docs/accessibility-testing |
| Lighthouse | Not confirmed. It runs axe rules in one page load (unconfirmed). One reporter said Lighthouse printed no contrast error where Pa11y did (different rule handling, not about states). | Pa11y issue only: "Contrast ratio potential false-positive #697" | https://github.com/pa11y/pa11y/issues/697 |
| Pa11y | Runs axe or HTML_CodeSniffer on one load. Issue tracker shows "needs review" results from axe being reported as errors. Nothing about hover or focus found. | "when axe can't determine the contrast ratio for certain elements" (in issue 697, quoted via a linked issue) | https://github.com/pa11y/pa11y/issues/697 |
| WAVE | Not checked. No source fetched. | none | none |
| IBM Equal Access | Search summary says IBM treats hover and focus as manual checks: "hover effects do not reduce the accessibility of the page". The IBM page fetch returned no text, so this is not confirmed from a fetched page. | unconfirmed | https://www.ibm.com/able/toolkit/verify/manual/ |
| Accessibility Insights for Web | Automated checks give "partial coverage"; content that disappears when focus moves needs the Ad hoc shortcut. No hover contrast check documented. | "Most tests ... require some human analysis" (FAQ, paraphrase of fetched summary); "ignore content marked with `display: none` or `visibility: hidden`." | https://accessibilityinsights.io/docs/web/reference/faq/ |
| Edge DevTools Inspect (same family of tools) | Single state. Forced state is the documented workaround. | "The **Inspect** tool reports accessibility issues for one state at a time." and "When using the **Inspect** tool, you can't reach the `hover` state on elements to test the text contrast ratio, because the `hover` state in your styles isn't triggered." | https://learn.microsoft.com/microsoft-edge/devtools-guide-chromium/accessibility/test-inspect-states |
| Polypane | Not checked. | none | none |
| Storybook a11y addon | Audits the rendered DOM of a story. Page does not say how hover or focus are handled and does not mention play functions. | "audit the rendered DOM against a set of heuristics based on WCAG rules"; "Incomplete" tab: items to "confirm manually because they could not be checked automatically" | https://storybook.js.org/docs/writing-tests/accessibility-testing |
| Storybook pseudo-states addon | Forces hover, focus, active by rewriting stylesheets, not by real browser state. | "rewrites all document stylesheets to add a class name selector to any rules that target a pseudo-class." Also: it "won't render any of the default user agent (browser) styles." Archived, merged into the Storybook monorepo. | https://github.com/chromaui/storybook-addon-pseudo-states |
| Chromatic | Snapshot is taken only after the play function ends. Page does not say it captures hover styles. | "Chromatic waits for the entire play function to execute and captures a snapshot only at the end." | https://www.chromatic.com/docs/interactions/ |
| Percy | Does not trigger states itself. | "Providing a selector does not automatically trigger the element's pseudo-state." You must force the state first, for example with JavaScript. Supported: `:hover`, `:focus`, `:active`, `:visited`, `:disabled`, `:checked`, `:popover-open`. | https://www.browserstack.com/docs/percy/percy-snapshot-config/configure-pseudo-class |

Summary: none of the tools I could read tests hover, focus, active or selected states by itself. Each one says to put the page in the state first and then scan. The gap is real and documented only by omission.

### Methods

#### 1. Real pointer: `locator.hover()` / `page.mouse.move()`
- How: `locator.hover()` waits for actionability, scrolls into view if needed and "Use Page.mouse to hover over the center of the element, or the specified position." Hover checks: Visible, Stable, Receives Events (table in https://playwright.dev/docs/actionability).
- Reaches: the element under the pointer gets real `:hover` and real mouse events. Maintainer: "Playwright moves the mouse over the element, which triggers `:hover` and all DOM mouse events." (https://github.com/microsoft/playwright/issues/29575)
- Ancestors getting `:hover`: unconfirmed from a fetched page (the MDN :hover page fetched did not say it). Selectors spec behavior from memory: the whole ancestor chain matches.
- Covered element: "Element is considered receiving pointer events when it is the hit target of the pointer event at the action point." So hover on a covered element times out, or with `force: true` hovers what is on top. (https://playwright.dev/docs/actionability)
- Scrolling: `scroll` option, default "if-needed" (Locator.hover docs via Context7, https://github.com/microsoft/playwright/blob/main/docs/src/api/class-locator.md). Scrolling can change the page, so measure after it.
- Mouse coordinates: "The Mouse class operates in main-frame CSS pixels relative to the top-left corner of the viewport." (https://playwright.dev/docs/api/class-mouse) Behavior inside a CSS-scaled or transformed frame: not found. Unconfirmed: Playwright computes the point from the element's rendered box, so it should land on the visible element, but a page inside an iframe that is scaled with `transform` was not tested or documented. Verify with `document.elementFromPoint` or by checking `:hover` matched.
- Trap: pointer position persists. After 1.62, "For newly added elements that cover (0,0), hovering events (like `mouseenter`) did not trigger before -- now they do." Cause given: Chromium feature `RenderDocument` "which Playwright disabled before 1.62". Workaround: "`page.mouse.move(-10, -10)`. Moving the mouse pointer out of it prevents hovering any element." (https://makandracards.com/makandra/8551-three-quick-rails-console-tips/previous?page=1, a small third-party note; the Playwright 1.62 to 1.65 release notes I read have no entry about this.) We use 1.65, so move the pointer away between elements.
- Cost: real pointer also fires `mouseenter`, `mouseover`, tooltips, popovers, hover menus. That is a plus (real behavior) and a risk (the UI changes).

#### 2. CDP `CSS.forcePseudoState`
- How (documented): command takes `nodeId` ("The element id for which to force the pseudo state.") and `forcedPseudoClasses` ("Element pseudo classes to force when computing the element's style."). Description: "Ensures that the given node will have specified pseudo-classes whenever its style is computed by the browser." `CSS.enable`: "Clients should not assume that the CSS agent has been enabled until the result of this command is received." (https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/CSS.pdl)
- Accepted names: the DevTools front end offers `active`, `hover`, `focus`, `focus-within`, `focus-visible`, `target` always, plus `visited`, `checked`, `disabled` and others for matching elements. It calls `cssModel.forcePseudoState(node, state, checked)` with the name without the colon. (https://chromium.googlesource.com/devtools/devtools-frontend/+/HEAD/front_end/panels/elements/ElementStatePaneWidget.ts) So `focus-visible` can be forced from DevTools. An older Chrome blog lists only "active, focus, hover, and visited" (https://developer.chrome.com/blog/triggering-of-pseudo-classes), so it is outdated.
- Session: Playwright gives `page.context().newCDPSession(page)` then `session.send(method, params)`. "CDP sessions are only supported on Chromium-based browsers." (Context7 Playwright docs). 1.65 adds `timeout` and `signal` options to `cdpSession.send()` (release notes).
- Node id from a Playwright handle: unconfirmed. From memory: call `DOM.enable`, `DOM.getDocument`, then `DOM.requestNode` with the `objectId` of the element (from `Runtime.evaluate` / `Runtime.callFunctionOn` in the same session), or `DOM.querySelector`. Node ids are only valid while the document stays the same and DOM agent tracks them.
- `DOM.enable` required: unconfirmed. The pdl text only requires `CSS.enable` (and that needs the DOM agent enabled, from memory).
- Reaches ancestors: not found. WebKit tests and Chromium source snippets only showed the element's own mask. Treat it as "the element only" until measured. A parent rule like `.card:hover .title` would not fire from forcing the child.
- Does not fire JS: Chrome blog and a search summary say forced state only affects CSS pseudo-classes, so JS hover handlers do not run (only partly confirmed; the fetched Chrome blog page itself did not address it).
- iframes and shadow roots: not found. Unconfirmed from memory: a session is per target; an iframe in the same process shares the page session, but node ids differ per document, and an out-of-process iframe needs its own session.
- Forced state is cleared when the session detaches or when the document reloads (unconfirmed; WebKit bug summary says cleanup order was once buggy).

#### 3. `:active`
- How: move to the element, `mouse.down()`, measure, then release. "`mouse.down()`: Dispatches a `mousedown` event." (https://playwright.dev/docs/api/class-mouse) Playwright's input guide says down/up are for "precise control over the drag operation" (https://playwright.dev/docs/input).
- Other effects (from standard browser behavior, unconfirmed by fetched page): mousedown moves focus to focusable targets, runs `onmousedown` handlers, starts text selection or drag. Releasing on the same element fires `click`. To avoid a click: move the pointer off the element before `mouse.up()`. Pointer capture or a drag start can change that.
- Alternative: force `:active` with CDP (method 2) which does not move focus or fire events.
- A search summary reported a Stack Overflow case where a screenshot after `mouse.down()` did not look pressed (no accepted answer). Playwright docs warn mouse position can be wrong if a handler runs between move and down (class-page docs, search summary).

#### 4. Keyboard focus
- `locator.focus()` sets focus; `press('Tab')` "focuses the selected element and produces a single keystroke" (https://playwright.dev/docs/input). Note `locator.press()` focuses the element first, so to test real Tab order press Tab on `page.keyboard`.
- `:focus-visible` matching is heuristic. MDN: "when a button is clicked using a pointing device, the focus is generally not visually indicated, but when a text box needing user input has focus, focus is indicated." and "focus styles are always required when users are navigating the page with the keyboard or when focus is managed via scripts" (https://developer.mozilla.org/docs/Web/CSS/:focus-visible). A WebKit report quotes: "If the current modality is mouse, and focus is programmatically sent to another element, :focus-visible does not match, which is expected." (via search summary of https://bugs.webkit.org/show_bug.cgi?id=242456, not fetched). That is WebKit; Chromium behavior for `focus()` after a keyboard key: unconfirmed.
- Safe way for `:focus-visible`: press Tab on the page keyboard so the browser's modality is keyboard (unconfirmed for Chromium, expected), or force `focus-visible` and `focus` through CDP.
- Trap: a mouse hover or click earlier in the same page makes the modality "mouse", so a later `focus()` may not match `:focus-visible`.

#### 5. Media features `hover` and `pointer`
- MDN: `hover` tests "whether the user's primary input mechanism can hover over elements"; `none` means "cannot hover at all or cannot conveniently hover"; `hover` means "can conveniently hover". (https://developer.mozilla.org/docs/Web/CSS/@media/hover)
- Headless Chromium desktop: whether `(hover: hover)` matches is not documented anywhere I fetched. Unconfirmed. Probe it with `matchMedia('(hover: hover)')` and `matchMedia('(any-hover: hover)')`, `matchMedia('(pointer: fine)')` at startup.
- Touch emulation: Playwright "isMobile controls whether ... touch events are enabled" ("Whether the meta viewport tag is taken into account and touch events are enabled", https://playwright.dev/docs/emulation). `hasTouch` is a context option (Context7). A search hit shows a Playwright test expecting mobile descriptors to give `(hover: none)` and desktop `(hover: hover)`; not fetched, unconfirmed. Media features depend on context creation, so use a separate context per mode.
- Reduced motion: `reducedMotion: 'reduce'` on context or `page.emulateMedia({ reducedMotion })` (https://playwright.dev/docs/emulation).
- Risk: a design system that wraps hover rules in `@media (hover: hover)` shows no hover styles if the emulated device says `hover: none`. Check the media features first and fail loudly if they do not match.

### Measuring after the state is on

- Transitions: Playwright's screenshot `animations: "disabled"` "stops CSS animations, CSS transitions and Web Animations": "finite animations are fast-forwarded to completion, so they'll fire `transitionend` event." and "infinite animations are canceled to initial state, and then played over after the screenshot." (Context7, https://github.com/microsoft/playwright/blob/main/docs/src/api/class-elementhandle.md). This applies to screenshots only, not to `getComputedStyle` reads.
- `document.getAnimations()` "returns an array of all `Animation` objects currently in effect ... This array includes CSS Animations, CSS Transitions, and Web Animations." (https://developer.mozilla.org/docs/Web/API/Document/getAnimations). Waiting on each `animation.finished`, or calling `finish()`, is from memory (unconfirmed by a fetched page; MDN page did not cover `finish()`). `finish()` on an infinite animation throws (unconfirmed).
- `prefers-reduced-motion` emulation only helps if the stylesheet honors it; it does not stop transitions on its own (reasoning, not sourced).
- Injected `transition: none !important` via a style tag: Playwright's screenshot `style` option adds text to a `<style>`. An injected style can be blocked by CSP (from the project's own notes in memory, not a fetched source). `page.addStyleTag` is subject to CSP; CDP `Emulation`/`Animation.setPlaybackRate` is an alternative that CSP does not block (`Animation.enable`, `setPlaybackRate` appear in the Playwright CDP example).
- Text and background colour: computed style gives the specified colour of the element and each ancestor. The painted colour needs compositing: walk ancestors for background colour, alpha-blend, multiply opacity of every ancestor, account for `mix-blend-mode`, `filter`, gradients and images. axe itself does not handle pseudo-element backgrounds, gradients, background images (quoted above). Sampling pixels from a screenshot avoids all of that but includes anti-aliasing and the text itself; sample the area next to the glyphs and the glyph core, for the pressed-and-hovered case where fill and text can match.
- `currentColor`: `getComputedStyle(el).color` resolves it to an rgb value (from memory, unconfirmed by fetch).
- Playwright waits for stability before screenshot or hover: "maintained the same bounding box for at least two consecutive animation frames" (actionability). A colour transition does not change the box, so this does not wait for colour.

### Finding the controls to visit

- Native: `button`, `a[href]`, `input` (not `type=hidden`), `select`, `textarea`, `summary`, `[contenteditable]`. ARIA roles: `button`, `link`, `checkbox`, `radio`, `switch`, `tab`, `menuitem`, `option`, `combobox`, `slider`, `treeitem`. Also `[tabindex]` not `-1`, `[onclick]`, and `cursor: pointer` computed. These lists are from memory (unconfirmed; the axe `focus-order-semantics` rule is a related list, https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md).
- Elements with hover or active rules: read `document.styleSheets` and walk `cssRules` (MDN: `cssRules` "returns a live `CSSRuleList` ... of every CSS rule", https://developer.mozilla.org/docs/Web/API/CSSStyleSheet/cssRules). Collect style rules whose `selectorText` contains `:hover`, `:active`, `:focus`, `:focus-visible`; strip the pseudo-class and test with `querySelectorAll`. Descend into `@media`, `@supports`, `@layer` rules (nested `cssRules`). Cross-origin stylesheets throw a `SecurityError` (unconfirmed, MDN page fetched did not say it). Nested CSS (`&:hover`) needs the nested `cssRules` of style rules (unconfirmed).
- Alternative: `CSS.getMatchedStylesForNode` returns "CSS rules matching this node, from all applicable stylesheets" and "Pseudo style matches for this node" (pdl file). It reports rules that match the current state only, so it does not list `:hover` rules that are not matching now (unconfirmed; check). The better use: force the state, then compare computed style before and after.
- Rows and cards: a `:hover` rule on a non-interactive element is found only by the stylesheet walk. Parent-based rules (`.row:hover .action`) need the ancestor to be really hovered, so use the real pointer on the ancestor.

### Cost and stability

- Per-element time: not found in any fetched source. Unconfirmed guess from experience: one `hover()` plus a style read is tens of milliseconds, up to 100 ms with actionability waits; screenshots add more. Measure on the real prototypes.
- Flakiness: a hover issue where "Hover state triggers focus-visible style instead of true hover" turned out to be Trace Viewer's highlight, not the page (https://github.com/microsoft/playwright/issues/29575). Real known risk: the 1.62 `(0,0)` hover change above.
- Visual tools: Playwright waits for fonts (`document.fonts.ready`) and disables animations before a screenshot (Context7, screenshotter source); `toHaveScreenshot` "will wait until two consecutive page screenshots yield the same result". Percy and Chromatic: state must be put in place before the snapshot (quoted above).

### Recommended pass

Common setup: one context per media mode (desktop with `hover: hover`, probe it with `matchMedia`). Start each page state at a fixed viewport. Move the pointer to (-10, -10) before each control.

1. Hover (plain control):
   - Move the real pointer to the visible, hit-testable point of the control with `locator.hover()`. Then wait for animations in the page (`document.getAnimations()` finished), then read computed text colour and background of the control and ancestors, and compare with the colour sampled from a screenshot of the control.
   - Reason: real hover runs the same rules and JS as a user and reaches ancestors, so parent-driven rules work.
   - Main risk: the control is covered or off-screen (hover times out or hits another element). Treat a timeout as a finding "cannot be hovered", not a pass. Second risk: tooltips and popovers opening and covering other controls; move away between controls.
2. Selected and hover (the case that slipped through):
   - First put the control in the selected state the way a user does: click it, or set the same attribute the design uses (`aria-pressed`, `aria-selected`, `aria-checked`, a class). Then run step 1 on it. Measure both the selected-only state and the selected-plus-hover state, and compare each text/fill pair.
   - Reason: forcing hover alone would miss a hover rule that wipes the selected fill, which is the reported bug. Real hover on the already selected control combines both rule sets with the page's own specificity.
   - Main risk: the click changes the page (navigation, dialogs). Reset the page state between controls, or use the attribute route and check the control reports the selected state after.
3. Focus:
   - Press Tab on `page.keyboard` until the control gets focus (or until a fixed count), read `document.activeElement` and `matches(':focus-visible')`. If it is not matched, fall back to CDP forcing of `focus` and `focus-visible` on that node. Measure the focus ring (outline or box-shadow contrast against the adjacent colours) and the text and fill pair.
   - Reason: Tab gives real `:focus-visible` and also tests that the control is reachable. CDP is the fallback because `element.focus()` after a mouse action may not match `:focus-visible` (MDN and WebKit notes).
   - Main risk: modality inference differs by browser version, so assert `:focus-visible` matched, and report when only the forced route reached it.
4. Active:
   - Move the real pointer onto the control, press with `mouse.down()`, wait for animations, measure, then move the pointer away from the element and `mouse.up()` so no click fires. Alternatively force `active` through `CSS.forcePseudoState` on the node (no events, no focus move).
   - Reason: pressed state is short lived; holding the button down is the only real way, and CDP is the quiet way.
   - Main risk: mousedown handlers and focus change or start a drag. For the quiet route, forced state does not reach ancestors and fires no JS.
5. After each control: release the button, clear forced states (`forcePseudoState` with an empty list), move the pointer to (-10, -10), re-read to check the style returned to rest.

### Traps

1. A scan at rest says nothing about states. Every tool read above works on one state (axe via Playwright: "will scan the page in its current state"). Source: https://playwright.dev/docs/accessibility-testing
2. axe `color-contrast` does not handle gradients, pseudo-element backgrounds, background images, overlap. Source: https://dequeuniversity.com/rules/axe/4.10/color-contrast
3. axe results of 1:1 ratio go to "incomplete", and Pa11y once reported such items as errors. Sources: same page and https://github.com/pa11y/pa11y/issues/697
4. Playwright 1.62 changed hover for elements under (0,0) when the pointer never moved. Park the pointer off screen. Source: https://makandracards.com/makandra/8551-three-quick-rails-console-tips/previous?page=1 (single third-party note).
5. `locator.hover()` fails or hits another element when the control is covered ("hit target"). Source: https://playwright.dev/docs/actionability
6. `locator.hover()` scrolls the element into view and can shift layout. Source: Locator.hover docs, `scroll` option.
7. Playwright 1.65: click and tap now wait for "not inert", and time out on inert elements (hover is not in the Not Inert column of the table). Source: https://playwright.dev/docs/release-notes
8. Forced pseudo-states change CSS only and do not run JS hover handlers (partly confirmed). Source: https://developer.chrome.com/blog/triggering-of-pseudo-classes (the fetched summary did not state it; a search summary did).
9. Stylesheet-rewrite tools (Storybook pseudo-states addon) skip user-agent styles and are not real state. Source: https://github.com/chromaui/storybook-addon-pseudo-states
10. `animations: "disabled"` fast-forwards finite animations but only for screenshots; computed-style reads can still see mid-transition colours. Source: Playwright screenshot docs (Context7).
11. `:focus-visible` after script focus depends on the last input modality; a prior mouse action can stop it matching. Sources: https://developer.mozilla.org/docs/Web/CSS/:focus-visible and https://bugs.webkit.org/show_bug.cgi?id=242456 (WebKit; search summary only).
12. Playwright mouse coordinates are main-frame CSS pixels, so point maths for a scaled or transformed preview frame needs checking. Source: https://playwright.dev/docs/api/class-mouse
13. `(hover: hover)` rules are skipped if the emulated device says `hover: none`. Source: https://developer.mozilla.org/docs/Web/CSS/@media/hover
14. Visual tools do not trigger states; the test must. Sources: Percy and Chromatic pages above.

### Not found or unsure

- WAVE and Polypane: no source read. Lighthouse and Pa11y: no statement about hover or focus found.
- IBM Equal Access and Lighthouse state coverage: IBM page fetch returned nothing; only a search summary.
- `CSS.forcePseudoState`: whether it reaches ancestors, works inside iframes or shadow roots, needs `DOM.enable`, and how to get a node id from an element handle. None confirmed from a fetched page.
- Whether forced `:hover` sets matching for `:hover` on ancestors (spec behavior from memory).
- Whether `(hover: hover)` and `(pointer: fine)` match in headless Chromium and headless shell, and what `hasTouch` or `isMobile` does to them in 1.65. Probe at startup.
- Chromium specifics of `:focus-visible` for `element.focus()` after Tab.
- `Animation.finish()` behavior and `finished` promise (not on a fetched page).
- Cross-origin `SecurityError` on `cssRules`, nested CSS rule walk, and whether `getMatchedStylesForNode` lists non-matching `:hover` rules.
- Pointer coordinates in a scaled or transformed iframe.
- Per-element timing and flake rates.
- Whether the makandra note about 1.62 still applies in 1.65 (the release notes I read, 1.62 to 1.65 first 100000 characters, have no hover entry).

## Part 3. Controls that work: toggles, filters, sorting, selects, search

The note's own title: Working controls in generated UI prototypes: sources

All quotes come from pages fetched on 2026-11-26. The fetch tool returns excerpts, so quotes are as returned. Status: STD = standard's requirement or normative pattern; COMMON = several sources agree; ONE = one source's opinion or one design system.

### Table

| # | Practice | Statement | Control / situation | Source | URL | Quote | Status |
|---|---|---|---|---|---|---|---|
| 1 | Dead targets in a prototype are a fidelity choice | A low-fidelity prototype has targets that do not work, and testers must know which. | Any clickable element in a prototype | NN/g, UX Prototypes: High vs Low Fidelity | https://www.nngroup.com/articles/ux-prototype-hi-lo-fidelity/ | "Sketchy prototypes can leave participants with "unclear expectations about what is supposed to work and what isn't."" (as returned: paraphrase-edited by the fetch tool) | ONE |
| 2 | A reviewer must be told what is not working | The facilitator tells the tester a target is not working and asks what they expected. | Dead click in a test | NN/g, same | https://www.nngroup.com/articles/ux-prototype-hi-lo-fidelity/ | The facilitator should say "That isn't working" and ask, "What were you expecting to happen when you clicked that?" | ONE |
| 3 | A wrong or slow response breaks flow | A prototype that shows the wrong page or responds slowly confuses the tester. | Any interaction | NN/g, same | https://www.nngroup.com/articles/ux-prototype-hi-lo-fidelity/ | "Seeing the wrong page also breaks the users' flow, and can confuse them." | ONE |
| 4 | Interactive prototypes respond only to intended targets | In an interactive prototype the designer decides which targets respond. | Clickable targets | NN/g, same | https://www.nngroup.com/articles/ux-prototype-hi-lo-fidelity/ | In interactive prototypes, designers must "make the system respond only when the user interacts with a clickable target." | ONE |
| 5 | Unclear clickability costs users time | Weak or wrong signifiers make users unsure what is clickable. | Any control | NN/g, Flat UI | https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/ | "They're experiencing click uncertainty." | ONE (covers the reverse case: clickable that looks static; see Not found) |
| 6 | Prototypes are meant to be interactive and realistic | The GOV.UK prototype kit exists to make interactive prototypes that give research feedback. | Prototype scope | GOV.UK Prototype Kit | https://prototype-kit.service.gov.uk/docs/ | "Quickly make interactive, accessible and realistic prototypes of GOV.UK services." | ONE |
| 7 | Toggle button = aria-pressed | A two-state button uses `aria-pressed`. | Daily/Weekly/Monthly as independent toggles | WAI-ARIA APG, Button pattern | https://www.w3.org/WAI/ARIA/apg/patterns/button/ | "To tell assistive technologies that a button is a toggle button, specify a value for the attribute aria-pressed." | STD (APG pattern) |
| 8 | A toggle's label must not change with state | State is conveyed by `aria-pressed`, not by renaming the label. | Pressed toggle, hover | WAI-ARIA APG, Button | https://www.w3.org/WAI/ARIA/apg/patterns/button/ | "Important: it is critical the label on a toggle does not change when its state changes." | STD (APG pattern) |
| 9 | Button keys | Space and Enter activate a button. | Toggle buttons | WAI-ARIA APG, Button | https://www.w3.org/WAI/ARIA/apg/patterns/button/ | "Space: Activates the button." / "Enter: Activates the button." | STD (APG pattern) |
| 10 | One-of-N choice = radio group | A radio group moves focus with arrows and checks one item. | Mutually exclusive options | WAI-ARIA APG, Radio Group | https://www.w3.org/WAI/ARIA/apg/patterns/radio/ | "Right Arrow and Down Arrow: move focus to the next radio button in the group, uncheck the previously focused button" | STD (APG pattern) |
| 11 | Radio focus entry | Focus enters on the checked radio, or the first if none is checked. | Radio group | WAI-ARIA APG, Radio Group | https://www.w3.org/WAI/ARIA/apg/patterns/radio/ | "If a radio button is checked, focus is set on the checked button." | STD (APG pattern) |
| 12 | Tabs change a panel | Tabs show one content panel at a time; arrows move between tabs. | View switch where each view is a section of content | WAI-ARIA APG, Tabs | https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ | "Tabs are a set of layered sections of content, known as tab panels, that display one panel of content at a time." | STD (APG pattern) |
| 13 | Toolbar groups controls with one tab stop | Arrow keys move among controls in a toolbar. | Group of toggle buttons in a toolbar | WAI-ARIA APG, Toolbar | https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/ | "the keyboard tab sequence includes one stop for the toolbar and arrow keys move focus among the controls" | STD (APG pattern) |
| 14 | Segmented control applies at once | Selecting a segment applies the choice immediately. | Segmented control | Primer, Segmented control | https://primer.style/product/components/segmented-control/ | "SegmentedControl is used to pick one choice from a linear set of closely related choices" ... should "immediately apply that selection." | ONE (one design system) |
| 15 | Segmented control keys differ from radio | In Primer, Tab moves between buttons, arrows do nothing, and pressing a selected button does nothing. | Segmented control | Primer, Segmented control accessibility | https://primer.style/product/components/segmented-control/accessibility/ | "Arrow keys don't change focus or selection, unlike in radio groups or toolbars." | ONE |
| 16 | Content switcher swaps views | A content switcher toggles between alternate views of related content, with one preselected. | Daily/Weekly/Monthly switching a chart | Carbon, Content switcher | https://carbondesignsystem.com/components/content-switcher/usage/ | "Content switchers allow users to toggle between alternate views of similar or related content" | ONE |
| 17 | Switcher has a default | The first option is the default and is chosen by usage. | Content switcher | Carbon, Content switcher | https://carbondesignsystem.com/components/content-switcher/usage/ | "The default view typically preselects one tab, usually the first tab." | ONE |
| 18 | Colour alone is not enough | Selection state needs more than colour. | Selected segment / pressed toggle | WCAG 2.2 SC 1.4.1 (Understanding) | https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html | "Color is not used as the only visual means of conveying information, indicating an action, prompting a response" "or distinguishing a visual element." | STD (WCAG A) |
| 19 | Instant filtering is the desktop expectation | Desktop filters update results on each selection; mobile uses Apply. | Dashboard filter selects | Baymard, Ecommerce filter UI | https://baymard.com/learn/ecommerce-filter-ui | "Real-time filtering (results update as selections are made) is the expected standard for desktop experiences." | ONE (e-commerce research, not dashboards) |
| 20 | Batch filtering is a valid alternative | Use Apply when filters are set together, notably with slow data. | Many filters, slow data | Carbon, Filtering pattern | https://carbondesignsystem.com/patterns/filtering/ | "Use a batch filter when all filters are applied together at the end of the selection process." | ONE |
| 21 | Instant returns results after each selection | Instant filtering returns results after each selection. | Filter | Carbon, Filtering pattern | https://carbondesignsystem.com/patterns/filtering/ | "This method returns results after each individual selection is made." | ONE |
| 22 | Show active filters in the results view | Active filters stay visible where the results are. | Filtered view | Baymard, Ecommerce filter UI; How to design applied filters | https://baymard.com/blog/how-to-design-applied-filters | "In many ways, an overview of applied filters is just as important as a page title or breadcrumbs" | COMMON (Baymard + Carbon indicator + Databricks bar) |
| 23 | Closed filter container shows a count | A filter panel shows how many filters are applied and a way to clear them. | Collapsed filters | Carbon, Filtering pattern | https://carbondesignsystem.com/patterns/filtering/ | "the indicator should include the number of filters applied" | ONE |
| 24 | Clear all | A way to reset all filters at once, back to default. | Filters | Carbon, Filtering; Baymard | https://carbondesignsystem.com/patterns/filtering/ | "Each category should have a way to clear all applied filters at once without having to interact with each individual item." | COMMON (Carbon + Baymard "Clear All") |
| 25 | Filter scope: page vs all pages, widget-level static | A filter applies to all visuals that share its dataset; a widget can have its own fixed filter. | Dashboard filters | Databricks, Dashboard filters | https://docs.databricks.com/aws/en/dashboards/filters/ | "Interactive filter widgets that apply to all visualizations on the same page that share one or more datasets." | ONE (vendor docs) |
| 26 | Show which widgets a filter affects | A per-widget indicator shows how many filters affect it; hover lists them. | Chart / KPI card | Databricks, Dashboard filters | https://docs.databricks.com/aws/en/dashboards/filters/ | "The widget filter indicator shows how many dashboard filters affect a visualization." | ONE |
| 27 | Status message without focus | A change such as "5 results returned" must be exposed to assistive tech without moving focus. | Result count after filter or search | WCAG 2.2 SC 4.1.3 (Understanding) | https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html | "such that they can be presented to the user by assistive technologies without receiving focus." (example: the message "5 results returned") | STD (WCAG AA) |
| 28 | Sortable header = button | The header text of a sortable column is a button. | Sortable column | WAI-ARIA APG, Sortable table | https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/ | "the header text of sortable columns is wrapped in a `button` element." | STD (APG example) |
| 29 | aria-sort on the sorted column only | `aria-sort` sits on the current sorted column and moves when the sort changes. | Table | WAI-ARIA APG, Sortable table | https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/ | "When the sorted column is changed, the `aria-sort` attribute is removed and set on the newly sorted column." | STD (APG example) |
| 30 | Non-sortable columns have no button | Columns without a button are not sortable. | Table | WAI-ARIA APG, Sortable table | https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/ | "(column headers with buttons are sortable)." | STD (APG example) |
| 31 | Sort indicator only where sort is active | Only the sorted column shows an arrow; others show it on hover. | Table header | Carbon, Data table | https://carbondesignsystem.com/components/data-table/usage/ | "Only the sorted column displays an icon, and unsorted icons are only visible on hover." | ONE |
| 32 | Native select limits | The native picker is styled by the OS and CSS cannot reach it. | Select | MDN, Customizable select | https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select | "Traditionally it has been difficult to customize the look and feel of `<select>` elements because they contain internals that are styled at the operating system level, which can't be targeted using CSS." | STD (reference doc) |
| 33 | Customizable select is not Baseline | `appearance: base-select` falls back to a classic select. | Styled select | MDN, same | https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select | "This feature is not Baseline because it does not work in some of the most widely-used browsers." | STD (reference doc) |
| 34 | Custom select-only combobox is not production code | The APG example is nearly equivalent to a native select and is not for production. | Custom select | WAI-ARIA APG, Select-only combobox | https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/ | "The code in this example is not intended for production environments." | STD (APG example) |
| 35 | Custom select has support gaps | Custom listboxes have AT and touch gaps that native selects avoid. | Custom select | WAI-ARIA APG, same | https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/ | "There may be support gaps in some browser and assistive technology combinations, especially for mobile/touch devices." | STD (APG example) |
| 36 | Select is a last resort for long lists | GOV.UK advises radios or fewer options before a select. | Select | GOV.UK Design System, Select | https://design-system.service.gov.uk/components/select/ | "The select component should only be used as a last resort in public-facing services" | ONE (applies to public services) |
| 37 | Do not use placeholder as label | Placeholder text disappears and is not a label. | Search / text input | NN/g, Placeholders in form fields | https://www.nngroup.com/articles/form-design-placeholders/ | "Disappearing placeholder text strains users' short-term memory." | ONE (NN/g; backed by WCAG 3.3.2) |
| 38 | Labels or instructions are required | Content that needs input has labels or instructions, kept visible where possible. | Any input | WCAG 2.2 SC 3.3.2 (Understanding) | https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html | "Labels or instructions are provided when content requires user input." | STD (WCAG A) |
| 39 | Accessible name contains visible label | The programmatic name includes the visible text. | Buttons, inputs, toggles | WCAG 2.2 SC 2.5.3 (Understanding) | https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html | "For user interface components with labels that include text or images of text, the name contains the text" ... "that is presented visually." | STD (WCAG A) |
| 40 | Search scope must be visible and broad by default | A scoped search shows its scope near the box and on the results, removable in one click. | Global vs list search | NN/g, Scoped search | https://www.nngroup.com/articles/scoped-search/ | "Make scoped search apparent by using strong visual cues." | ONE (NN/g, about site search) |
| 41 | Table search is a toolbar control | Carbon puts table search in the table toolbar, closed by default. | Table search | Carbon, Data table | https://carbondesignsystem.com/components/data-table/usage/ | "A search field can be triggered through an icon button in the data table toolbar." | ONE |
| 42 | Empty state states status | An empty view still tells the user what is happening. | Empty data view | NN/g, Empty states | https://www.nngroup.com/articles/empty-state-interface-design/ | "Totally empty states cause confusion about how and whether the system is working." | ONE |
| 43 | First-use empty state offers a path | Give a direct pathway to populate it. | First-use empty state | NN/g, Empty states | https://www.nngroup.com/articles/empty-state-interface-design/ | "Provide direct pathways (i.e., links) to getting started with key tasks related to populating the empty state." | ONE |
| 44 | Skeleton vs spinner | Spinner for one module, skeleton for a full screen; nothing under 1 second. | Loading data view | NN/g, Skeleton screens | https://www.nngroup.com/articles/skeleton-screens/ | "Spinners are typically best used on a single module, like a video or a card which is on a dashboard." | COMMON (NN/g + Carbon) |
| 45 | Skeleton for table loading | Carbon prefers skeleton states for tables. | Table loading | Carbon, Data table | https://carbondesignsystem.com/components/data-table/usage/ | "If extra load time is expected to display information, use skeleton states instead of spinners." | ONE |
| 46 | Long waits need an estimate | Above 10 seconds, show a duration estimate. | Loading | NN/g, Skeleton screens | https://www.nngroup.com/articles/skeleton-screens/ | "Anything above 10 seconds requires an explicit estimation of duration." | ONE |

### Rules for the builder

1. Every control that looks interactive must change something visible, or be rendered as plainly static (not a button, link, select or arrow); never leave a working-looking control with no effect (rows 1, 3, 5).
2. A control that cannot work in this prototype must carry a visible, honest marker (a disabled state with a stated reason, or a note on the page) so a reviewer knows it is out of scope (rows 1, 2, 4).
3. A Daily / Weekly / Monthly group must change the data its chart or table shows, and the displayed numbers and axis labels must change with it (rows 14, 16).
4. Pick the pattern by what the control does: independent on/off options use toggle buttons with `aria-pressed`, one-of-N options that change data use a radio-style group or a segmented control with one always selected, and views of separate content use tabs (rows 7, 10, 12, 14, 16).
5. Show the selected option with more than colour (a check, weight, outline or fill shape) and keep that state visible on hover and focus (row 18).
6. Never change a toggle's label or hide it on hover or pressed; the state goes in `aria-pressed` or `aria-checked` and in styling (row 8).
7. Give each group the keyboard behaviour of its pattern: Space or Enter on buttons, arrows plus one tab stop for radios and tabs; do not mix patterns (rows 9, 10, 11, 12, 13, 15).
8. A filter must update every part of the page it governs when it changes, with state held in one place, and the scope must be visible (a label such as "Filters apply to: all charts", or a per-widget marker) (rows 25, 26).
9. Apply filters instantly by default on desktop; use an Apply button only when data is slow or many filters are set together, and then show a pending state (rows 19, 20, 21).
10. After a filter or search changes, update the result count or a summary, keep active filters visible in the results view, and offer one Clear all that returns to the default (rows 22, 23, 24, 27).
11. A column that shows a sort control must be a button that sorts the rows, with `aria-sort` on the one sorted column only; columns that cannot be sorted show no sort control (rows 28, 29, 30, 31).
12. Use a native `<select>` unless a listed need cannot be met by it; if the page needs a styled popup, use `appearance: base-select` with a native fallback, or an APG-conformant listbox, and note the native popup is drawn by the browser or OS (rows 32, 33, 34, 35, 36).
13. A search field has a visible label or an icon-and-text label, not only a placeholder, an accessible name that contains the visible text, and it filters the stated scope on input or on submit (rows 37, 38, 39, 40, 41).
14. Every data view has an empty state that says why it is empty and keeps filters and the search field in place, with a "clear filters" action when filters caused it and a start action on first use (rows 24, 42, 43).
15. Every data view that can load shows a skeleton (full view or table) or spinner (one card) while loading, and an error state with a retry, with filters still usable (rows 44, 45, 46).

### What a brief must say

For each control the brief states:
1. What it changes: the data, view or sort order, named exactly (rows 1, 5, 16).
2. Which parts of the page it governs, by name, and which it does not (rows 25, 26).
3. Its options, the default selection and whether exactly one must always be selected (rows 14, 17, 20).
4. When it applies: instantly or on Apply, and the feedback it gives (count, loading state, summary) (rows 19, 20, 21, 22, 27).
5. Its reset: what "clear" returns to (row 24).
6. Its empty, loading and error behaviour: what shows when there is no result, and that the control itself stays usable (rows 42, 43, 44, 45).
7. Its pattern and keyboard behaviour: toggle, radio-style, tabs, or native select (rows 7, 10, 12, 32, 36).
8. Whether it is real or mock: if it does nothing in this prototype, how it is marked (rows 1, 2, 4, 6).

### Not found or disputed

- No published NN/g or other source was found that directly says "a control that looks clickable but does nothing is a defect in a prototype"; NN/g covers the reverse (clickable looks static, row 5) and says dead targets are normal at low fidelity (row 1). Rules 1 and 2 are therefore an inference from rows 1 to 5, not a quoted requirement.
- Not fetched, or the page returned no body text (JavaScript sites): Material 3 segmented buttons, Apple HIG segmented controls, Fluent, Polaris, Atlassian, Figma and Axure guidance, Interaction Design Foundation, Baymard guideline 486 text. Claims about them are omitted.
- GOV.UK prototype kit page did not say what a prototype may fake or must make work.
- Carbon filtering page gives no guidance on feedback during filtering; Carbon data table page gives no default sort guidance and no empty-state guidance.
- Baymard's instant-filter evidence is e-commerce; no dashboard-specific research was found. Apply-vs-instant is design-system choice, not a standard.
- "How a selected option is shown beyond colour" has only the WCAG 1.4.1 rule (row 18); no design-system quote on a check mark was retrieved.
- Primer's segmented-control keyboard model (no arrow keys) conflicts with the APG radio model (arrows); the sources disagree, so the builder must pick one pattern and keep to it.
- Search field behaviour on input vs on submit: no source fetched; only scope (row 40) and labels (rows 37 to 39).
- Hover or focus styling of a selected option: no source found beyond row 8 (label must not change).
- GOV.UK's select guidance (row 36) is for public services; it is not a rule for dashboards.
