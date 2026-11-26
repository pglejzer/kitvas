// The options of a draft's version (plan 25, ADR 0082): the choices one version holds, such as a
// light and a dark theme or two and three columns. Pure values and rules, no package: the server,
// the studio's page and the frame all import this file (ADR 0080). The file a version keeps them
// in is read by the drafts module (`src/drafts/domain/options.ts`).

/** The option whose values are the kit's themes. */
export const THEME_OPTION = 'theme';

/** An option's id: it becomes a part of an attribute name (`data-opt-<id>`). */
export const OPTION_ID = /^[a-z][a-z0-9-]{0,30}$/;
/** A value's id: it becomes an attribute's value; `2` and `3` are values. */
export const OPTION_VALUE = /^[a-z0-9][a-z0-9-]{0,30}$/;

export const MAX_OPTIONS = 8;
export const MIN_VALUES = 2;
export const MAX_VALUES = 6;

/** What an address names a value with: `opt-columns=2`. */
export const OPTION_PARAM = 'opt-';

export type DraftOption = {
  id: string;
  label: string;
  /** The id of one of `values`. */
  default: string;
  values: { id: string; label: string }[];
};

/** Option id to value id, for every option of the version. */
export type OptionChoice = Record<string, string>;

/** Every option at its default. */
export function defaultChoice(options: readonly DraftOption[]): OptionChoice {
  return Object.fromEntries(options.map((option) => [option.id, option.default]));
}

/**
 * `asked` made into a choice the version has: an id it does not have is dropped, a value an
 * option does not have becomes that option's default.
 */
export function pickChoice(
  options: readonly DraftOption[],
  asked: Readonly<Record<string, string | undefined>>,
): OptionChoice {
  return Object.fromEntries(
    options.map((option) => {
      const value = asked[option.id];
      const known = option.values.some((one) => one.id === value);
      return [option.id, known && value !== undefined ? value : option.default];
    }),
  );
}

/** The values that differ from the defaults, in the options' order. */
export function offDefault(
  options: readonly DraftOption[],
  choice: OptionChoice,
): { id: string; value: string }[] {
  return options.flatMap((option) => {
    const value = choice[option.id];
    return value === undefined || value === option.default ? [] : [{ id: option.id, value }];
  });
}

/** The choice an address asks for, from its `opt-<id>=<value>` pairs. */
export function choiceFromQuery(
  options: readonly DraftOption[],
  query: { get(name: string): string | null },
): OptionChoice {
  const asked = Object.fromEntries(
    options.map((option) => [option.id, query.get(`${OPTION_PARAM}${option.id}`) ?? undefined]),
  );
  return pickChoice(options, asked);
}

/** The pairs an address needs for `choice`: one per value that differs from its default. */
export function choiceToQuery(
  options: readonly DraftOption[],
  choice: OptionChoice,
): [string, string][] {
  return offDefault(options, choice).map(({ id, value }) => [`${OPTION_PARAM}${id}`, value]);
}

/** The root attribute a value shows as: `data-opt-columns`. */
export function optionAttribute(id: string): string {
  return `data-opt-${id}`;
}

/** The selector of one value: `[data-opt-columns="2"]`. */
export function optionSelector(id: string, value: string): string {
  return `[${optionAttribute(id)}="${value}"]`;
}
