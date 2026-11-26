// options.json: the choices one version holds (plan 25, ADR 0082), such as a light and a dark theme
// or two and three columns. The values and limits are in `src/shared/values/options.ts`, which the
// studio's page and the frame import too.

import {
  type DraftOption,
  type Issue,
  MAX_OPTIONS,
  MAX_VALUES,
  MIN_VALUES,
  OPTION_ID,
  OPTION_VALUE,
  THEME_OPTION,
  z,
} from '../../shared/index.ts';

const idsAreUnique = (items: readonly { id: string }[]): boolean =>
  new Set(items.map((item) => item.id)).size === items.length;

const OptionSchema = z.strictObject({
  id: z.string().regex(OPTION_ID),
  label: z.string().min(1),
  default: z.string().regex(OPTION_VALUE),
  values: z
    .array(z.strictObject({ id: z.string().regex(OPTION_VALUE), label: z.string().min(1) }))
    .min(MIN_VALUES)
    .max(MAX_VALUES)
    .refine(idsAreUnique),
});

export const OptionsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  options: z.array(OptionSchema).max(MAX_OPTIONS).refine(idsAreUnique),
});

const hasDefault = (option: DraftOption): boolean =>
  option.values.some((value) => value.id === option.default);

/** The options of a file that reads and whose defaults are values; none for a file that does not. */
export function parseOptions(raw: unknown): DraftOption[] {
  const parsed = OptionsSchema.safeParse(raw);
  return parsed.success && parsed.data.options.every(hasDefault) ? parsed.data.options : [];
}

/**
 * The problems of an options file; a missing file (`undefined`) has none. `themes` are the ids of
 * the kit's themes: the option `theme` may name only those, so with none it is always a problem.
 */
export function optionsIssues(raw: unknown, themes: readonly string[]): Issue[] {
  if (raw === undefined) return [];
  const parsed = OptionsSchema.safeParse(raw);
  if (!parsed.success) {
    return [{ path: 'options', key: 'draftIssue.optionsInvalid', params: {} }];
  }
  return parsed.data.options.flatMap((option): Issue[] => {
    const found: Issue[] = [];
    if (!hasDefault(option)) {
      found.push({
        path: `options.${option.id}.default`,
        key: 'draftIssue.optionsDefault',
        params: { id: option.id, value: option.default },
      });
    }
    if (option.id === THEME_OPTION) {
      for (const value of option.values) {
        if (themes.includes(value.id)) continue;
        found.push({
          path: `options.${option.id}.values`,
          key: 'draftIssue.optionsTheme',
          params: { value: value.id },
        });
      }
    }
    return found;
  });
}
