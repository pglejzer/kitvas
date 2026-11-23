// The guideline book: one entry per rule and per checklist item, with its sources (ADR 0043).

export const CHAPTERS = [
  'contrast',
  'layout',
  'focus',
  'input',
  'motion',
  'type',
  'space',
  'hierarchy',
  'cards',
  'chrome',
  'media',
  'look',
  'forms',
  'errors',
  'states',
  'actions',
  'content',
  'navigation',
  'code',
] as const;
export type Chapter = (typeof CHAPTERS)[number];

export type GuidelineSource = { name: string; url: string };

export type Guideline = {
  /** `<check>/<name>`, the same as the rule id. */
  id: string;
  check: 'a11y' | 'ui' | 'ux';
  chapter: Chapter;
  /** `auto`: every check; `deep`: `kitvas check --deep`; `manual`: the compose skill's checklist. */
  mode: 'auto' | 'deep' | 'manual';
  /** 'mixed' when the rule reports both; null only for manual entries. */
  severity: 'fix' | 'review' | 'mixed' | null;
  /** `source`: a fetched page states it; `heuristic`: a kitvas starting value. */
  basis: 'source' | 'heuristic';
  /** The numbers the rule uses; a rule writes none of its own. */
  thresholds: Readonly<Record<string, number>>;
  /** https URLs only; at least one when basis is 'source'. */
  sources: readonly GuidelineSource[];
  /** Screen kinds (the drafts module's SCREEN_KINDS) it applies to; null: every screen. */
  screens: readonly string[] | null;
  /** camelCase of `<check>-<name>`: `ui/line-length` → `uiLineLength`. Stem of its locale keys. */
  key: string;
};
