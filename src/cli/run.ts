// Runs one command line: parse, run, print for people or as JSON, map errors to exit codes.

import {
  createTranslator,
  exitCodeOf,
  KitvasError,
  loadMessages,
  loadSettings,
  type Translate,
} from '../shared/index.ts';
import { parseCliArgs } from './args.ts';
import type { Command } from './registry.ts';

export type Io = {
  out(text: string): void;
  err(text: string): void;
  cwd: string;
  home: string;
  localesDir: string;
};

function usage(commands: Command[], t: Translate): string {
  const width = Math.max(...commands.map((command) => command.name.length));
  const lines = commands.map((command) => `  ${command.name.padEnd(width)}  ${t(command.summary)}`);
  return [t('cli.usage'), '', t('cli.commands'), ...lines].join('\n');
}

function toKitvasError(cause: unknown): KitvasError {
  if (cause instanceof KitvasError) return cause;
  return new KitvasError('INTERNAL', {
    detail: cause instanceof Error ? cause.message : String(cause),
  });
}

export async function runCli(argv: string[], commands: Command[], io: Io): Promise<number> {
  let json = argv.includes('--json');
  let t = createTranslator(loadMessages(io.localesDir, 'en'));
  try {
    const args = parseCliArgs(argv);
    json = args.json;
    if (args.help || args.command === undefined) {
      io.out(usage(commands, t));
      return args.help ? 0 : 2;
    }
    const command = commands.find((candidate) => candidate.name === args.command);
    if (!command) {
      throw new KitvasError('USAGE', { detail: t('cli.unknownCommand', { name: args.command }) });
    }
    const settings = loadSettings({ home: io.home, cwd: io.cwd });
    t = createTranslator(loadMessages(io.localesDir, settings.language));
    const data = await command.run({
      cwd: io.cwd,
      home: io.home,
      positionals: args.positionals,
      flags: args.flags,
      t,
    });
    io.out(json ? JSON.stringify({ ok: true, data }) : command.render(data, t));
    return 0;
  } catch (cause) {
    const error = toKitvasError(cause);
    const message = t(`error.${error.code}`, error.params);
    io.err(json ? JSON.stringify({ ok: false, error: { code: error.code, message } }) : message);
    return exitCodeOf(error.code);
  }
}
