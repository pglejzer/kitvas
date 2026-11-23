// Guideline entries: ux-forms (forms and errors), with the word lists their rules use.

import type { Guideline } from './types.ts';

/** Input types that are not a field a person fills in. */
export const NON_FIELD_TYPES: readonly string[] = ['hidden', 'submit', 'button', 'reset', 'image'];
/** Input types that are not text-like: the label sits beside them, not above. */
export const NON_TEXT_TYPES: readonly string[] = ['checkbox', 'radio', 'range', 'color', 'file'];
/** A field with a name or label saying this is a search box. */
export const SEARCH_WORDS: readonly string[] = ['search'];
/** Label or name words that call for a specific input type, with the type to use. */
export const INPUT_CONTACT_WORDS: Readonly<Record<string, string>> = {
  email: 'email',
  'e-mail': 'email',
  phone: 'tel',
  telephone: 'tel',
  tel: 'tel',
  mobile: 'tel',
  url: 'url',
  website: 'url',
};
/** Label words that make `type=number` fine: the value is a quantity. */
export const INPUT_QUANTITY_WORDS: readonly string[] = [
  'qty',
  'quantity',
  'amount',
  'count',
  'number of',
  'how many',
  'age',
];
/** An error text that is only one of these words (case-insensitive, an optional full stop). */
export const VAGUE_ERROR_WORDS: readonly string[] = ['invalid', 'error', 'required', 'wrong'];

export const UX_VISIBLE_LABEL = {
  id: 'ux/visible-label',
  check: 'ux',
  chapter: 'forms',
  mode: 'auto',
  severity: 'mixed',
  basis: 'source',
  thresholds: {},
  sources: [
    {
      name: 'NN/g: placeholders are not labels',
      url: 'https://www.nngroup.com/articles/form-design-placeholders/',
    },
    {
      name: 'GOV.UK text input',
      url: 'https://design-system.service.gov.uk/components/text-input/',
    },
    { name: 'Carbon forms pattern', url: 'https://carbondesignsystem.com/patterns/forms-pattern/' },
  ],
  screens: null,
  key: 'uxVisibleLabel',
} as const satisfies Guideline;

export const UX_FIELDSET = {
  id: 'ux/fieldset',
  check: 'ux',
  chapter: 'forms',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: { minGroup: 2 },
  sources: [
    { name: 'GOV.UK radios', url: 'https://design-system.service.gov.uk/components/radios/' },
  ],
  screens: null,
  key: 'uxFieldset',
} as const satisfies Guideline;

export const UX_REQUIRED_MARKS = {
  id: 'ux/required-marks',
  check: 'ux',
  chapter: 'forms',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [
    {
      name: 'NN/g: marking required fields',
      url: 'https://www.nngroup.com/articles/required-fields/',
    },
    { name: 'USWDS forms', url: 'https://designsystem.digital.gov/components/form/' },
    { name: 'Carbon forms pattern', url: 'https://carbondesignsystem.com/patterns/forms-pattern/' },
  ],
  screens: null,
  key: 'uxRequiredMarks',
} as const satisfies Guideline;

export const UX_LABEL_POSITION = {
  id: 'ux/label-position',
  check: 'ux',
  chapter: 'forms',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  /** `width`: the only width the rule runs at; `aboveTolerance`: px the label's bottom may pass the field's top. */
  thresholds: { width: 390, aboveTolerance: 4 },
  sources: [
    { name: 'NN/g: web form design', url: 'https://www.nngroup.com/articles/web-form-design/' },
    {
      name: 'GOV.UK text input',
      url: 'https://design-system.service.gov.uk/components/text-input/',
    },
    { name: 'Carbon forms pattern', url: 'https://carbondesignsystem.com/patterns/forms-pattern/' },
  ],
  screens: null,
  key: 'uxLabelPosition',
} as const satisfies Guideline;

export const UX_SINGLE_COLUMN = {
  id: 'ux/single-column',
  check: 'ux',
  chapter: 'forms',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  /** `overlap`: the share of the smaller height that two fields' rows must share to count as one row. */
  thresholds: { width: 390, overlap: 0.5 },
  sources: [
    { name: 'NN/g: web form design', url: 'https://www.nngroup.com/articles/web-form-design/' },
  ],
  screens: null,
  key: 'uxSingleColumn',
} as const satisfies Guideline;

export const UX_FIELD_COUNT = {
  id: 'ux/field-count',
  check: 'ux',
  chapter: 'forms',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: { maxFields: 8 },
  sources: [
    {
      name: 'Baymard: checkout form fields',
      url: 'https://baymard.com/blog/checkout-flow-average-form-fields',
    },
  ],
  screens: ['checkout', 'sign-up'],
  key: 'uxFieldCount',
} as const satisfies Guideline;

export const UX_INPUT_TYPE = {
  id: 'ux/input-type',
  check: 'ux',
  chapter: 'forms',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [
    {
      name: 'GOV.UK text input',
      url: 'https://design-system.service.gov.uk/components/text-input/',
    },
  ],
  screens: null,
  key: 'uxInputType',
} as const satisfies Guideline;

export const UX_SUBMIT = {
  id: 'ux/submit',
  check: 'ux',
  chapter: 'forms',
  mode: 'auto',
  severity: 'review',
  basis: 'heuristic',
  thresholds: {},
  sources: [],
  screens: null,
  key: 'uxSubmit',
} as const satisfies Guideline;

export const UX_ERROR_WORDING = {
  id: 'ux/error-wording',
  check: 'ux',
  chapter: 'errors',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  /** `minWords`: an error text of fewer words is too short to say what to fix. */
  thresholds: { minWords: 3 },
  sources: [
    {
      name: 'GOV.UK error message',
      url: 'https://design-system.service.gov.uk/components/error-message/',
    },
    {
      name: 'NN/g: error message guidelines',
      url: 'https://www.nngroup.com/articles/error-message-guidelines/',
    },
    { name: 'WebAIM: form validation', url: 'https://webaim.org/techniques/formvalidation/' },
  ],
  screens: null,
  key: 'uxErrorWording',
} as const satisfies Guideline;

export const UX_BROKEN_ANCHOR = {
  id: 'ux/broken-anchor',
  check: 'ux',
  chapter: 'errors',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [
    {
      name: 'GOV.UK error summary',
      url: 'https://design-system.service.gov.uk/components/error-summary/',
    },
  ],
  screens: null,
  key: 'uxBrokenAnchor',
} as const satisfies Guideline;

export const UX_KEEPS_INPUT = {
  id: 'ux/keeps-input',
  check: 'ux',
  chapter: 'errors',
  mode: 'auto',
  severity: 'fix',
  basis: 'source',
  thresholds: {},
  sources: [
    {
      name: 'GOV.UK error message',
      url: 'https://design-system.service.gov.uk/components/error-message/',
    },
    {
      name: 'NN/g: error message guidelines',
      url: 'https://www.nngroup.com/articles/error-message-guidelines/',
    },
  ],
  screens: null,
  key: 'uxKeepsInput',
} as const satisfies Guideline;

export const UX_FORMS_GUIDELINES: readonly Guideline[] = [
  UX_VISIBLE_LABEL,
  UX_FIELDSET,
  UX_REQUIRED_MARKS,
  UX_LABEL_POSITION,
  UX_SINGLE_COLUMN,
  UX_FIELD_COUNT,
  UX_INPUT_TYPE,
  UX_SUBMIT,
  UX_ERROR_WORDING,
  UX_BROKEN_ANCHOR,
  UX_KEEPS_INPUT,
];
