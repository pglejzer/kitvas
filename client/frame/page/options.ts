// The values of the version's options a frame shows (plan 25). The root carries one attribute per
// option (`data-opt-columns="2"`), which the draft's styles read; the render is handed the same
// choice as a prop. A choice the studio sends is turned into one this build has, so an option the
// build lost shows its own default.

import {
  type DraftOption,
  type OptionChoice,
  optionAttribute,
  pickChoice,
} from '../../../src/shared/values/options.ts';

/** The part of the page's root element the choice is written to. */
export type RootAttributes = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

export type Choices = {
  /** The choice that shows. */
  get(): OptionChoice;
  /** `asked` as a choice this build has: an unknown id is dropped, an unknown value is the default. */
  pick(asked: Readonly<Record<string, string | undefined>>): OptionChoice;
  /** Whether `next` (as `pick` gives it) is another choice than the one that shows. */
  differs(next: OptionChoice): boolean;
  /** `next` shows from now on: its attributes are on the root. */
  set(next: OptionChoice): void;
  /**
   * A new build's options take the place of the old: the attributes of an option that left go,
   * the choice that shows is picked again from the new options. Gives that choice.
   */
  swap(next: readonly DraftOption[]): OptionChoice;
};

/** `first` is a choice `options` have; its attributes are put on `root` at once. */
export function createChoices(
  root: RootAttributes,
  options: readonly DraftOption[],
  first: OptionChoice,
): Choices {
  let known = options;
  let shown = first;
  const write = (): void => {
    for (const option of known) {
      const value = shown[option.id];
      if (value !== undefined) root.setAttribute(optionAttribute(option.id), value);
    }
  };
  write();
  return {
    get: () => shown,
    pick: (asked) => pickChoice(known, asked),
    differs: (next) => known.some((option) => next[option.id] !== shown[option.id]),
    set(next) {
      shown = next;
      write();
    },
    swap(next) {
      for (const option of known) {
        if (!next.some((one) => one.id === option.id)) {
          root.removeAttribute(optionAttribute(option.id));
        }
      }
      known = next;
      shown = pickChoice(next, shown);
      write();
      return shown;
    },
  };
}
