// Guideline entries: ux states, actions, links, navigation and copy (spec section 5).

import type { Guideline } from './types.ts';

const NNG = 'https://www.nngroup.com/articles';

/** The word lists the flow rules read. Data of the book, so a rule holds no list of its own. */
export const UX_FLOW_WORDS = {
  /** A loading state must not say it found nothing. */
  noResults: [
    'no results',
    'no items',
    'no orders',
    'no data',
    'nothing here',
    'nothing yet',
    'empty',
  ],
  /** Visible words that tell the person the content is on its way. */
  loading: ['loading', 'please wait', 'fetching', 'updating', 'saving'],
  /** Button names that say nothing about the outcome. */
  vagueButtons: ['ok', 'submit', 'yes', 'no', 'go', 'click here'],
  /** Link names that need their surroundings to make sense. */
  vagueLinks: ['click here', 'here', 'more', 'read more', 'learn more'],
  /** A variant-like prop, in the order they are read. */
  variantProps: ['variant', 'appearance', 'kind', 'intent', 'emphasis', 'hierarchy'],
  primaryValues: ['solid', 'contained', 'filled', 'primary', 'brand', 'cta', 'accent'],
  notPrimaryValues: [
    'outline',
    'outlined',
    'ghost',
    'plain',
    'text',
    'subtle',
    'link',
    'secondary',
    'tertiary',
    'soft',
    'light',
  ],
  /** The names of an action that destroys something. */
  danger: ['delete', 'remove', 'discard'],
} as const;

export const UX_EMPTY_REGION = {
  id: 'ux/empty-region',
  check: 'ux',
  chapter: 'states',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [{ name: 'NN/g: empty states', url: `${NNG}/empty-state-interface-design/` }],
  screens: null,
  key: 'uxEmptyRegion',
} as const satisfies Guideline;

export const UX_EMPTY_NEXT_STEP = {
  id: 'ux/empty-next-step',
  check: 'ux',
  chapter: 'states',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { minWords: 3 },
  sources: [{ name: 'NN/g: empty states', url: `${NNG}/empty-state-interface-design/` }],
  screens: null,
  key: 'uxEmptyNextStep',
} as const satisfies Guideline;

export const UX_LOADING_SAYS_EMPTY = {
  id: 'ux/loading-says-empty',
  check: 'ux',
  chapter: 'states',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [{ name: 'NN/g: empty states', url: `${NNG}/empty-state-interface-design/` }],
  screens: null,
  key: 'uxLoadingSaysEmpty',
} as const satisfies Guideline;

export const UX_LOADING_INDICATOR = {
  id: 'ux/loading-indicator',
  check: 'ux',
  chapter: 'states',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [
    { name: 'NN/g: response time limits', url: `${NNG}/response-times-3-important-limits/` },
  ],
  screens: null,
  key: 'uxLoadingIndicator',
} as const satisfies Guideline;

export const UX_ERROR_RECOVERY = {
  id: 'ux/error-recovery',
  check: 'ux',
  chapter: 'states',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [{ name: 'NN/g: ten usability heuristics', url: `${NNG}/ten-usability-heuristics/` }],
  screens: null,
  key: 'uxErrorRecovery',
} as const satisfies Guideline;

export const UX_STATE_SHIFT = {
  id: 'ux/state-shift',
  check: 'ux',
  chapter: 'states',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: { tolerance: 1 },
  sources: [{ name: 'web.dev: Cumulative Layout Shift', url: 'https://web.dev/articles/cls' }],
  screens: null,
  key: 'uxStateShift',
} as const satisfies Guideline;

export const UX_ONE_PRIMARY = {
  id: 'ux/one-primary',
  check: 'ux',
  chapter: 'actions',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { maxPrimary: 1, minContrast: 3 },
  sources: [
    {
      name: 'Carbon: button usage',
      url: 'https://carbondesignsystem.com/components/button/usage/',
    },
    { name: 'GOV.UK: button', url: 'https://design-system.service.gov.uk/components/button/' },
  ],
  screens: null,
  key: 'uxOnePrimary',
} as const satisfies Guideline;

export const UX_DANGER_PRIMARY = {
  id: 'ux/danger-primary',
  check: 'ux',
  chapter: 'actions',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [
    { name: 'GOV.UK: button', url: 'https://design-system.service.gov.uk/components/button/' },
  ],
  screens: null,
  key: 'uxDangerPrimary',
} as const satisfies Guideline;

export const UX_BUTTON_TEXT = {
  id: 'ux/button-text',
  check: 'ux',
  chapter: 'actions',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [
    { name: 'GOV.UK: button', url: 'https://design-system.service.gov.uk/components/button/' },
    { name: 'NN/g: confirmation dialogs', url: `${NNG}/confirmation-dialog/` },
  ],
  screens: null,
  key: 'uxButtonText',
} as const satisfies Guideline;

export const UX_LINK_TEXT = {
  id: 'ux/link-text',
  check: 'ux',
  chapter: 'navigation',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [{ name: 'NN/g: learn-more links', url: `${NNG}/learn-more-links/` }],
  screens: null,
  key: 'uxLinkText',
} as const satisfies Guideline;

export const UX_SAME_TEXT_LINKS = {
  id: 'ux/same-text-links',
  check: 'ux',
  chapter: 'navigation',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: {},
  sources: [],
  screens: null,
  key: 'uxSameTextLinks',
} as const satisfies Guideline;

export const UX_HIDDEN_NAV = {
  id: 'ux/hidden-nav',
  check: 'ux',
  chapter: 'navigation',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { width: 1280 },
  sources: [{ name: 'NN/g: hamburger menus', url: `${NNG}/hamburger-menus/` }],
  screens: null,
  key: 'uxHiddenNav',
} as const satisfies Guideline;

export const UX_CURRENT_PAGE = {
  id: 'ux/current-page',
  check: 'ux',
  chapter: 'navigation',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { minLinks: 2 },
  sources: [{ name: 'NN/g: ten usability heuristics', url: `${NNG}/ten-usability-heuristics/` }],
  screens: null,
  key: 'uxCurrentPage',
} as const satisfies Guideline;

export const UX_PLACEHOLDER_TEXT = {
  id: 'ux/placeholder-text',
  check: 'ux',
  chapter: 'content',
  mode: 'auto',
  severity: 'mixed',
  basis: 'heuristic',
  thresholds: {},
  sources: [],
  screens: null,
  key: 'uxPlaceholderText',
} as const satisfies Guideline;

export const UX_FLOW_GUIDELINES: readonly Guideline[] = [
  UX_EMPTY_REGION,
  UX_EMPTY_NEXT_STEP,
  UX_LOADING_SAYS_EMPTY,
  UX_LOADING_INDICATOR,
  UX_ERROR_RECOVERY,
  UX_STATE_SHIFT,
  UX_ONE_PRIMARY,
  UX_DANGER_PRIMARY,
  UX_BUTTON_TEXT,
  UX_LINK_TEXT,
  UX_SAME_TEXT_LINKS,
  UX_HIDDEN_NAV,
  UX_CURRENT_PAGE,
  UX_PLACEHOLDER_TEXT,
];
