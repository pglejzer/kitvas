// The values of the version's options the page shows (plan 25), one store per page. Setting it
// tells every card's frame (they render in place and never reload), rewrites the address with
// `history.replaceState` and tells the listeners: the row, the caption, the editor's panels. A
// value the version does not have is never sent. The frames' own answers (`frameReady`,
// `frameShown`) keep it true: a frame that loaded again is told what to show, and a frame that
// shows something else (an older build) is not a failure, the row shows what the frames show.

import {
  choiceToQuery,
  type DraftOption,
  OPTION_PARAM,
  type OptionChoice,
} from '../../../src/shared/values/options.ts';
import type { Frame } from '../frames.ts';

/** What a panel of the page needs: the options, the values shown, and a way to change them. */
export type ChoiceStore = {
  options(): readonly DraftOption[];
  get(): OptionChoice;
  set(next: OptionChoice): void;
  /** Returns the way to stop listening. */
  subscribe(listener: (choice: OptionChoice) => void): () => void;
};

/** The store as the page's script uses it: it also hears the frames, and "Make default". */
export type ChoiceControl = ChoiceStore & {
  /** A frame loaded or took a build in: if it shows other values than these, tell it. */
  frameReady(frame: Frame, shown: OptionChoice): void;
  /** The current frame answered a switch with what it shows. */
  frameShown(shown: OptionChoice): void;
  /** The values now shown are the defaults (the file was changed, or was changed back). */
  redefine(defaults: OptionChoice): void;
};

export type ChoiceDeps = {
  options: readonly DraftOption[];
  /** The values the address asked for; an unknown one is the default. */
  initial: OptionChoice;
  /** Every card's frame. */
  frames(): readonly Frame[];
  send(frame: Frame, choice: OptionChoice): void;
  address: { href(): string; replace(href: string): void };
};

/** Whether two choices are the same for these options; an id a choice lacks is the default. */
export function sameChoice(
  options: readonly DraftOption[],
  one: OptionChoice,
  other: OptionChoice,
): boolean {
  return options.every(
    (option) => (one[option.id] ?? option.default) === (other[option.id] ?? option.default),
  );
}

/**
 * `asked` laid over `current`: an id the options lack, and a value an option lacks, change nothing,
 * so what is sent is always a choice the version has.
 */
export function laidOver(
  options: readonly DraftOption[],
  current: OptionChoice,
  asked: OptionChoice,
): OptionChoice {
  return Object.fromEntries(
    options.map((option) => {
      const value = asked[option.id];
      if (value !== undefined && option.values.some((one) => one.id === value)) {
        return [option.id, value];
      }
      return [option.id, current[option.id] ?? option.default];
    }),
  );
}

/** `href` with its `opt-` pairs replaced by those of `choice`: one for each value off its default. */
export function optionsAddress(
  href: string,
  options: readonly DraftOption[],
  choice: OptionChoice,
): string {
  const url = new URL(href);
  for (const name of [...url.searchParams.keys()]) {
    if (name.startsWith(OPTION_PARAM)) url.searchParams.delete(name);
  }
  for (const [name, value] of choiceToQuery(options, choice)) url.searchParams.set(name, value);
  return url.href;
}

export function createChoiceStore(deps: ChoiceDeps): ChoiceControl {
  let options = deps.options.map((option) => ({ ...option }));
  let choice = laidOver(options, {}, deps.initial);
  /** Switches sent that the current frame has not answered yet. */
  let waiting = 0;
  const listeners = new Set<(choice: OptionChoice) => void>();

  /** The address and the listeners follow the values. */
  function publish(): void {
    deps.address.replace(optionsAddress(deps.address.href(), options, choice));
    for (const listener of [...listeners]) listener({ ...choice });
  }

  return {
    options: () => options,
    get: () => ({ ...choice }),
    set(next) {
      const picked = laidOver(options, choice, next);
      if (sameChoice(options, picked, choice)) return;
      choice = picked;
      const frames = deps.frames();
      for (const frame of frames) deps.send(frame, choice);
      if (frames.length > 0) waiting += 1;
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    frameReady(frame, shown) {
      if (!sameChoice(options, shown, choice)) deps.send(frame, choice);
    },
    frameShown(shown) {
      waiting = Math.max(0, waiting - 1);
      // Older answers of a quick run of switches are not the latest word.
      if (waiting > 0) return;
      const picked = laidOver(options, choice, shown);
      if (sameChoice(options, picked, choice)) return;
      choice = picked;
      publish();
    },
    redefine(defaults) {
      options = options.map((option) => {
        const value = defaults[option.id];
        if (value === undefined || !option.values.some((one) => one.id === value)) return option;
        return { ...option, default: value };
      });
      publish();
    },
  };
}

const stores = new WeakMap<HTMLElement, ChoiceStore>();

/** Makes `store` the page's: panels find it by the page's `main` (`choiceStoreOf`). */
export function registerChoiceStore(main: HTMLElement, store: ChoiceStore): void {
  stores.set(main, store);
}

/** The page's store; `undefined` for a version without options. */
export function choiceStoreOf(main: HTMLElement): ChoiceStore | undefined {
  return stores.get(main);
}
