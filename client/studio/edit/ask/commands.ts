// The commands the ask bar lists after a `/` (redesign spec goal 10; plan 19, task T3): Improve
// first, then every action of the context menu that runs by itself. Each has the menu's own words,
// icon and key hint, and the reason when it is off. Pure: the bar draws it and runs the pick.

import type { IconName } from '../../../../src/studio/pages/icons/paths.ts';
import { isMac } from '../../shell/shortcuts.ts';
import type { EditorState } from '../store.ts';
import { type ActionId, actionsFor } from '../structure/actions.ts';
import { partTarget } from '../structure/list-parts.ts';
import { itemTarget } from '../structure/lists.ts';
import { menuIcon, menuItems } from '../structure/menu.ts';
import { text } from '../texts.ts';
import type { Say } from './model.ts';

export type CommandId = ActionId | 'improve';

export type Command = {
  id: CommandId;
  label: string;
  /** Its key as the list of shortcuts shows it (`Ctrl+D`); `null` for a command without one. */
  keys: string | null;
  enabled: boolean;
  /** Why it is off, in words; `null` while it is on. */
  reason: string | null;
  icon: IconName | null;
};

/**
 * `replace` takes a component from a second list: it has no way to run from one line, so it stays
 * in the menu only.
 */
const NOT_HERE: ReadonlySet<ActionId> = new Set<ActionId>(['replace']);

/** The text after a leading `/`; `null` when the field does not start with one (it is a request). */
export function queryOf(raw: string): string | null {
  return raw.startsWith('/') ? raw.slice(1) : null;
}

/** Every word of the query is somewhere in the label or the id. */
function matches(command: Command, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${command.label} ${command.id}`.toLowerCase();
  return words.every((word) => hay.includes(word));
}

export type CommandOptions = { mac?: boolean; say?: Say };

/** The commands for the query, in order: Improve, then the actions as the menu lists them. */
export function commandsFor(
  state: EditorState,
  query: string,
  options: CommandOptions = {},
): Command[] {
  const say: Say = options.say ?? text;
  const improve: Command = {
    id: 'improve',
    label: say('ask.cmd.improve'),
    keys: null,
    enabled: state.selection.length > 0,
    reason: state.selection.length > 0 ? null : say('ask.reason.select'),
    // The studio has no icon for it; the icon's place stays empty, as in the menu.
    icon: null,
  };
  const mac = options.mac ?? (typeof navigator === 'undefined' ? false : isMac(navigator.platform));
  const actions = menuItems(
    actionsFor(state),
    state.hidden.length,
    mac,
    itemTarget(state) !== null,
    partTarget(state) !== null,
  );
  const rest = actions.flatMap((item): Command[] =>
    item.action === null || NOT_HERE.has(item.action)
      ? []
      : [
          {
            id: item.action,
            label: item.label,
            keys: item.hint,
            enabled: item.enabled,
            reason: item.reason,
            icon: menuIcon(item),
          },
        ],
  );
  return [improve, ...rest].filter((command) => matches(command, query));
}
