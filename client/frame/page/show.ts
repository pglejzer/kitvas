// What the frame does when the studio asks for another state or other values of the options. Both
// take one path: the render changes inside the motion that follows the elements, the followers
// (marks, editor, lens pins) are told, and the studio is answered with what shows, also when
// nothing changed, so it is never left waiting.

import type { OptionChoice } from '../../../src/shared/values/options.ts';
import type { Choices } from './options.ts';

export type ShowDeps = {
  choices: Choices;
  /** The states the build on the page has. */
  states(): readonly string[];
  /** The state the page opened with. */
  initial: string;
  /** Runs `render` and gives a promise of where the elements moved to (`drag/motion/motion.ts`). */
  change(render: () => void): Promise<void>;
  /** Renders one state with one choice; when it returns, they are in the DOM. */
  render(state: string, choice: OptionChoice): void;
  /** The render changed: the state's attribute and the followers of the elements' movement. */
  changed(state: string, moved: Promise<void>): void;
  /** Tells the studio what shows. */
  answer(state: string, choice: OptionChoice): void;
};

export type Show = {
  /** The state that shows. */
  current(): string;
  /** A build with other states was taken in: the state is its own again. */
  reset(state: string): void;
  /**
   * Shows `state` with `asked` (the choice that shows when it is left out). A state the build does
   * not have is ignored.
   */
  show(state: string, asked?: Readonly<Record<string, string | undefined>>): void;
};

export function createShow(deps: ShowDeps): Show {
  const { choices } = deps;
  let current = deps.initial;
  return {
    current: () => current,
    reset(state) {
      current = state;
    },
    show(state, asked = choices.get()) {
      if (!deps.states().includes(state)) return;
      const next = choices.pick(asked);
      if (state !== current || choices.differs(next)) {
        const moved = deps.change(() => {
          choices.set(next);
          deps.render(state, next);
        });
        current = state;
        deps.changed(state, moved);
      }
      deps.answer(state, choices.get());
    },
  };
}
