// What a kitvas command is.

import type { Translate } from '../shared/index.ts';
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
};

type TypedCommand<T> = {
  name: string;
  summary: string;
  run(ctx: CommandContext): Promise<T> | T;
  render(data: T, t: Translate): string;
};

export function defineCommand<T>(command: TypedCommand<T>): Command {
  return command as unknown as Command;
}
