// What a kitvas command is.

import type { KitvasError, Translate } from '../shared/index.ts';
import type { Flags } from './args.ts';

export type CommandContext = {
  cwd: string;
  home: string;
  positionals: string[];
  flags: Flags;
  t: Translate;
};

export type Command = {
  name: string;
  /** Message key of the one-line description. */
  summary: string;
  run(ctx: CommandContext): Promise<unknown> | unknown;
  render(data: unknown, t: Translate): string;
  /** An error for the exit code when the answer says something failed; the answer is still printed. */
  failure?(data: unknown): KitvasError | undefined;
  /**
   * The command runs when the settings files cannot be read: its messages come in the default
   * language and the command reports the broken file itself. Others end with `CONFIG_INVALID`.
   */
  runsWithoutSettings?: boolean;
};

type TypedCommand<T> = {
  name: string;
  summary: string;
  run(ctx: CommandContext): Promise<T> | T;
  render(data: T, t: Translate): string;
  failure?(data: T): KitvasError | undefined;
  runsWithoutSettings?: boolean;
};

export function defineCommand<T>(command: TypedCommand<T>): Command {
  return command as unknown as Command;
}
