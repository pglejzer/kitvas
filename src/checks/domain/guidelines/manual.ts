// Guideline entries for the compose skill's checklist: no rule runs them (ADR 0043).

import type { Chapter, Guideline, GuidelineSource } from './types.ts';

const nng = (slug: string): GuidelineSource => ({
  name: 'NN/g',
  url: `https://www.nngroup.com/articles/${slug}/`,
});
const govuk = (name: string, path: string): GuidelineSource => ({
  name: `GOV.UK Design System: ${name}`,
  url: `https://design-system.service.gov.uk/${path}`,
});
const wcag = (name: string, slug: string): GuidelineSource => ({
  name: `WCAG ${name}`,
  url: `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
});

type Draft = {
  id: string;
  chapter: Chapter;
  sources?: readonly GuidelineSource[];
  thresholds?: Readonly<Record<string, number>>;
  screens?: readonly string[];
};

const camel = (words: string[]): string =>
  words.map((word, i) => (i === 0 ? word : (word[0] ?? '').toUpperCase() + word.slice(1))).join('');

/** A manual entry; `heuristic` when no source is given. */
function manual(entry: Draft): Guideline {
  const [check = '', name = ''] = entry.id.split('/');
  const sources = entry.sources ?? [];
  return {
    id: entry.id,
    check: check as Guideline['check'],
    chapter: entry.chapter,
    mode: 'manual',
    severity: null,
    basis: sources.length > 0 ? 'source' : 'heuristic',
    thresholds: entry.thresholds ?? {},
    sources,
    screens: entry.screens ?? null,
    key: camel([check, ...name.split('-')]),
  };
}

export const MANUAL_GUIDELINES: readonly Guideline[] = [
  manual({
    id: 'ui/squint',
    chapter: 'hierarchy',
    sources: [
      nng('visual-hierarchy-ux-definition'),
      { name: 'NN/g: squint test', url: 'https://www.nngroup.com/videos/squint-test/' },
    ],
  }),
  manual({
    id: 'ui/few-sizes',
    chapter: 'hierarchy',
    sources: [nng('visual-hierarchy-ux-definition')],
  }),
  manual({
    id: 'ui/one-boundary',
    chapter: 'cards',
    sources: [
      { name: 'Laws of UX: common region', url: 'https://lawsofux.com/law-of-common-region/' },
      { name: 'Atlassian: elevation', url: 'https://atlassian.design/foundations/elevation' },
    ],
  }),
  manual({ id: 'ui/real-media', chapter: 'media' }),
  manual({ id: 'ui/ground-colour', chapter: 'look' }),
  manual({
    id: 'ui/mobile-text',
    chapter: 'type',
    thresholds: { minBodyPx: 16 },
    sources: [
      { name: 'USWDS: typography', url: 'https://designsystem.digital.gov/components/typography/' },
    ],
  }),
  manual({ id: 'ui/real-copy', chapter: 'content' }),
  manual({ id: 'ui/brand-visible', chapter: 'look' }),
  manual({
    id: 'ui/thumb-reach',
    chapter: 'actions',
    sources: [
      { name: 'Laws of UX: Fitts law', url: 'https://lawsofux.com/fittss-law/' },
      nng('sticky-headers'),
    ],
  }),
  manual({
    id: 'ux/error-says-fix',
    chapter: 'errors',
    sources: [
      govuk('error message', 'components/error-message/'),
      nng('error-message-guidelines'),
      { name: 'WebAIM: form validation', url: 'https://webaim.org/techniques/formvalidation/' },
    ],
  }),
  manual({
    id: 'ux/confirm-destructive',
    chapter: 'actions',
    sources: [nng('confirmation-dialog')],
  }),
  manual({
    id: 'ux/validate-late',
    chapter: 'forms',
    sources: [
      {
        name: 'Baymard: inline validation',
        url: 'https://baymard.com/blog/inline-form-validation',
      },
      {
        name: 'Smashing Magazine: inline validation',
        url: 'https://www.smashingmagazine.com/2022/09/inline-validation-web-forms-ux/',
      },
      {
        name: 'Carbon: forms pattern',
        url: 'https://carbondesignsystem.com/patterns/forms-pattern/',
      },
    ],
  }),
  manual({
    id: 'ux/one-question',
    chapter: 'forms',
    sources: [govuk('question pages', 'patterns/question-pages/')],
  }),
  manual({
    id: 'ux/toggle-immediate',
    chapter: 'forms',
    sources: [nng('toggle-switch-guidelines')],
  }),
  manual({
    id: 'ux/success-feedback',
    chapter: 'states',
    sources: [nng('ten-usability-heuristics')],
  }),
  manual({
    id: 'ux/headings-specific',
    chapter: 'content',
    sources: [nng('f-shaped-pattern-reading-web-content-discovered')],
  }),
  manual({
    id: 'ux/front-load',
    chapter: 'content',
    sources: [nng('f-shaped-pattern-reading-web-content-discovered')],
  }),
  // Baymard's checkout research is not among the verified sources, so this one stays heuristic.
  manual({ id: 'ux/guest-checkout', chapter: 'forms', screens: ['checkout'] }),
  manual({
    id: 'a11y/drag-alternative',
    chapter: 'input',
    sources: [wcag('2.5.7 Dragging Movements', 'dragging-movements')],
  }),
  manual({
    id: 'a11y/redundant-entry',
    chapter: 'forms',
    sources: [wcag('3.3.7 Redundant Entry', 'redundant-entry')],
  }),
];
